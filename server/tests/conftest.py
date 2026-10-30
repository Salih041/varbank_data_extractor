# Testler gerçek Groq'a veya Tavily'ye istek atmaz: model ve arama istemcisi sahteleriyle değiştirilir.

import json
import os
import re

# .env olmayan ortamda da app yüklenebilsin
os.environ.setdefault("GROQ_API_KEY", "gsk_FAKEtest12345")
os.environ.setdefault("TAVILY_API_KEY", "tvly-FAKEtest12345")
# Testler gerçek konuşma veritabanına yazmaz; her şey bellekte kalır.
os.environ["CHECKPOINT_DB"] = ":memory:"
# Testler sabit bir erişim anahtarı kullanır (gerçek .env anahtarı değil).
os.environ["ACCESS_KEY"] = "test-access-key-123"

import uuid

import pytest
from fastapi.testclient import TestClient
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage, AIMessageChunk
from langchain_core.outputs import ChatGenerationChunk

from app.agent import graph as graph_module
from app.agent import tools as tools_module
from app import auth, rate_limit
from app.main import app, thread_key


class FakeLLM(GenericFakeChatModel):
    # Hazır sahte model araç çağrılarını akışta veremiyor; bu sürüm metni kelime kelime,
    # araç çağrısını tek parça olarak verir.
    def _stream(self, messages, stop=None, run_manager=None, **kwargs):
        message = self._generate(messages).generations[0].message
        if message.tool_calls:
            chunks = [
                {"name": c["name"], "args": json.dumps(c["args"]), "id": c["id"], "index": i}
                for i, c in enumerate(message.tool_calls)
            ]
            yield ChatGenerationChunk(message=AIMessageChunk(content="", tool_call_chunks=chunks))
            return
        for part in re.split(r"(\s)", message.content):
            if part:
                yield ChatGenerationChunk(message=AIMessageChunk(content=part))


def use_fake_llm(monkeypatch, *replies):
    # replies: metin (normal cevap) veya AIMessage (ör. araç çağrısı içeren cevap)
    messages = [r if isinstance(r, AIMessage) else AIMessage(r) for r in replies]
    fake = FakeLLM(messages=iter(messages))
    monkeypatch.setattr(graph_module, "llm_with_tools", fake)
    monkeypatch.setattr(graph_module, "llm_answer_only", fake)


def search_call(query):
    return AIMessage("", tool_calls=[{"name": "web_search", "args": {"query": query}, "id": "call_1"}])


def ask_call(question, options=None):
    args = {"question": question, "options": options or []}
    return AIMessage("", tool_calls=[{"name": "ask_user", "args": args, "id": "call_ask"}])


class FakeTavily:
    def __init__(self, results):
        self.results = results
        self.queries = []

    def search(self, query, max_results, timeout):
        self.queries.append(query)
        return {"results": self.results}


def use_fake_tavily(monkeypatch, results):
    fake = FakeTavily(results)
    monkeypatch.setattr(tools_module, "tavily", fake)
    return fake


def new_thread():
    # Her test kendi konuşmasını açar; önceki testlerin mesajları karışmaz.
    return str(uuid.uuid4())


def read_events(response):
    # SSE metnini [(olay_adı, veri), ...] listesine çevirir.
    events = []
    for block in response.text.strip().split("\n\n"):
        name, data = block.split("\n")
        events.append((name.removeprefix("event: "), json.loads(data.removeprefix("data: "))))
    return events


INSTALL_ID = "0b5e8c1d-2f4a-4c3b-9d7e-6a1f2e3d4c5b"
ACCESS_KEY = os.environ["ACCESS_KEY"]


def config_for(thread):
    # Sunucunun bu kurulum + konuşma için kullandığı checkpointer ayarı.
    return {"configurable": {"thread_id": thread_key(INSTALL_ID, thread)}}


@pytest.fixture
def client():
    rate_limit.reset()
    auth.reset()
    headers = {"X-Install-Id": INSTALL_ID, "Authorization": f"Bearer {ACCESS_KEY}"}
    return TestClient(app, headers=headers)
