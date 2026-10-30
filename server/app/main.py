# Sunucunun giriş noktası. Çalıştırma (server/ klasöründe):
#   uv run uvicorn app.main:app --reload

import json
import logging
import time
from uuid import UUID

from fastapi import FastAPI, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from langchain_core.messages import HumanMessage
from langgraph.types import Command

from app import rate_limit
from app.agent.graph import graph
from app.agent.prompts import user_content
from app.auth import check_access_key
from app.checkpoint import checkpointer
from app.client_ip import client_ip
from app.config import settings
from app.errors import error_code, retry_after
from app.retention import cleanup_in_background
from app.schemas import ChatRequest

app = FastAPI(title="Table Extractor Agent", version="0.1.0")
logger = logging.getLogger("agent")

# agent -> tools -> agent zincirinin her halkası bir adım. Arama sayısını graph.py sınırlar;
# bu, beklenmedik bir döngüye karşı son güvenlik ağıdır.
MAX_GRAPH_STEPS = 12
# Model "düşünürken" en fazla bu sıklıkta status olayı gönderilir.
STATUS_EVERY_SECONDS = 5
# En büyük geçerli istek (120.000 karakter tablo + 8.000 karakter mesaj) bunun altında kalır.
MAX_BODY_BYTES = 600_000

# CORS: tarayıcıya "bu sunucuya yalnızca bizim eklentimiz istek atabilir" der.
# Bu bir kimlik doğrulama değildir; tarayıcı dışından (ör. curl) gelen istekleri engellemez.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.allowed_origin] if settings.allowed_origin else [],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "X-Install-Id", "Authorization"],
)


@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    # Çok büyük istekleri okumadan reddeder.
    if int(request.headers.get("content-length") or 0) > MAX_BODY_BYTES:
        return JSONResponse({"detail": "TOO_LARGE"}, status_code=413)
    return await call_next(request)


def sse(event: str, data: dict) -> str:
    # SSE biçimi: "event: <ad>" ve "data: <json>" satırları, ardından boş satır.
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def thread_key(install_id: UUID, thread_id: UUID) -> str:
    # Konuşma, eklentinin kurulum kimliğiyle birlikte saklanır. Başka bir kurulum
    # aynı thread_id'yi gönderse bile farklı bir deftere ulaşır; başkasının konuşmasını göremez.
    return f"{install_id}:{thread_id}"


@app.get("/health")
def health():
    # Anahtar istemez: Cloud Run ve eklenti "sunucu ayakta mı?" diye buna bakar.
    return {"status": "ok"}


@app.get("/auth/check", status_code=204)
def auth_check(request: Request):
    # Eklenti, ayarlarda girilen anahtarı kaydetmeden önce burada doğrular.
    check_access_key(request)


@app.post("/chat")
def chat(req: ChatRequest, request: Request, install_id: UUID = Header(alias="X-Install-Id")):
    check_access_key(request)
    cleanup_in_background()
    if not rate_limit.allow_request(client_ip(request)):
        return JSONResponse({"detail": "RATE_LIMIT"}, status_code=429)

    # thread_id: hangi konuşmanın defterine yazılacağı. Önceki mesajlar oradan okunur.
    # recursion_limit: grafik en fazla bu kadar adım atabilir (sonsuz arama döngüsüne karşı).
    config = {
        "recursion_limit": MAX_GRAPH_STEPS,
        "configurable": {"thread_id": thread_key(install_id, req.thread_id)},
    }

    # Agent bu konuşmada kullanıcıya soru sorup bekliyorsa, gelen mesaj o sorunun cevabıdır:
    # grafik yeni baştan başlamaz, durduğu yerden (ask_user içinden) devam eder.
    if graph.get_state(config).interrupts:
        graph_input = Command(resume=req.message)
    else:
        graph_input = {"messages": [HumanMessage(user_content(req.message, req.attachment))]}

    return StreamingResponse(events(graph_input, config), media_type="text/event-stream")


@app.delete("/threads/{thread_id}", status_code=204)
def delete_thread(thread_id: UUID, request: Request, install_id: UUID = Header(alias="X-Install-Id")):
    # Kullanıcı konuşmayı eklentide silince sunucudaki kaydı (tablo verisi dahil) da silinir.
    check_access_key(request)
    checkpointer.delete_thread(thread_key(install_id, thread_id))


def events(graph_input, config):
    try:
        # İki tür akış birlikte dinlenir:
        #   "messages": modelin yazdığı her parça (token)
        #   "updates":  bir düğüm işini bitirince eklediği mesajlar (ve grafik durduysa sorusu)
        stream = graph.stream(graph_input, config, stream_mode=["messages", "updates"])
        last_status = 0.0
        for mode, data in stream:
            if mode == "messages":
                chunk, metadata = data
                if metadata["langgraph_node"] != "agent":
                    continue
                if chunk.content:
                    yield sse("token", {"text": chunk.content})
                elif chunk.additional_kwargs.get("reasoning_content") and time.time() - last_status > STATUS_EVERY_SECONDS:
                    # Model cevap yazmadan önce "düşünüyor" (metin yok). Arada bir haber verilir ki
                    # kullanıcı ne olduğunu görsün ve bağlantı uzun süre sessiz kalmasın.
                    last_status = time.time()
                    yield sse("status", {"state": "thinking"})

            elif "agent" in data:
                # Model arama yapmaya karar verdiyse, arama başlamadan kullanıcıya göster.
                for call in data["agent"]["messages"][-1].tool_calls:
                    if call["name"] == "web_search":
                        yield sse("tool_start", {"tool": "web_search", "query": call["args"].get("query", "")})

            elif "tools" in data:
                for tool_message in data["tools"]["messages"]:
                    if tool_message.name == "web_search":
                        yield sse("tool_result", {"tool": "web_search", "sources": tool_message.artifact or []})

            elif "__interrupt__" in data:
                # Grafik ask_user içinde durdu: soruyu (ve seçenekleri) kullanıcıya gönder.
                for item in data["__interrupt__"]:
                    yield sse("question", item.value)

        yield sse("done", {})
    except Exception as error:
        # Logda yalnızca hatanın türü yazılır, mesajı yazılmaz (anahtar/veri içerebilir).
        code = error_code(error)
        logger.warning("chat failed: %s -> %s", type(error).__name__, code)
        data = {"code": code}
        seconds = retry_after(error)
        if seconds:
            data["retry_after"] = seconds
        yield sse("error", data)
