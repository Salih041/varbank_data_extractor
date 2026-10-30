# Agent grafiği:
#
#   START -> agent --(araç istedi mi?)--> tools -> agent -> ... -> END
#                  \--(istemedi)-------> END

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage, trim_messages
from langchain_core.messages.utils import count_tokens_approximately
from langchain_groq import ChatGroq
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition

from app.agent.prompts import SYSTEM_PROMPT
from app.agent.tools import ask_user, web_search
from app.checkpoint import checkpointer
from app.config import settings

# Bir soru için en fazla bu kadar web araması yapılır.
MAX_SEARCHES_PER_TURN = 3

tools = [web_search, ask_user]

llm = ChatGroq(
    model=settings.groq_model,
    api_key=settings.groq_api_key,
    temperature=0.3,
    max_tokens=2048,
    timeout=60,
)
# bind_tools: modele "bu araçları kullanabilirsin" der (adlarını ve açıklamalarını gönderir).
llm_with_tools = llm.bind_tools(tools)
# Araç bağlanmamış model: araç çağıramaz, elindeki bilgiyle cevap vermek zorundadır.
# (Groq'ta tool_choice="none" güvenilir değil: model yine araç çağırmaya çalışıp hata alıyor.)
llm_answer_only = llm

SEARCH_LIMIT_NOTE = (
    "Search limit reached: answer now using only the information above. Do not call any tools."
)


def searches_this_turn(messages) -> int:
    # Son kullanıcı mesajından bu yana kaç web araması yapıldı?
    count = 0
    for message in reversed(messages):
        if isinstance(message, HumanMessage):
            break
        if isinstance(message, ToolMessage) and message.name == "web_search":
            count += 1
    return count


def without_old_searches(messages):
    # Önceki sorulardaki web aramalarını (arama isteği + sonuçları) çıkarır. O soruların cevapları
    # zaten bulunanları özetliyor; ham sonuçları her turda yeniden göndermek token israfı olur.
    # Bu turdaki aramalar ve kullanıcıya sorulan sorular (ask_user) her zaman kalır.
    last_human = max(i for i, m in enumerate(messages) if isinstance(m, HumanMessage))
    dropped_calls = set()
    kept = []
    for i, m in enumerate(messages):
        if i < last_human and isinstance(m, AIMessage) and m.tool_calls:
            if all(call["name"] == "web_search" for call in m.tool_calls):
                dropped_calls.update(call["id"] for call in m.tool_calls)
                continue
        if isinstance(m, ToolMessage) and m.tool_call_id in dropped_calls:
            continue
        kept.append(m)
    return kept


def agent(state: MessagesState):
    history = without_old_searches(state["messages"])
    # Konuşma uzadıkça en eski mesajlar atılır; en yeniler sınıra sığdığı kadar kalır.
    trimmed = trim_messages(
        history,
        max_tokens=settings.max_history_tokens,
        token_counter=count_tokens_approximately,
        strategy="last",
        start_on="human",
    )
    if not trimmed:
        # Son soru tek başına sınırdan büyük: yine de gönderilir (en fazla Groq "çok büyük" der).
        last_human = max(i for i, m in enumerate(history) if isinstance(m, HumanMessage))
        trimmed = history[last_human:]
    messages = [SystemMessage(SYSTEM_PROMPT)] + trimmed

    # Arama hakkı bittiyse model durmadan aramaya devam edemez, cevap yazmak zorunda kalır.
    if searches_this_turn(state["messages"]) >= MAX_SEARCHES_PER_TURN:
        reply = llm_answer_only.invoke(messages + [SystemMessage(SEARCH_LIMIT_NOTE)])
    else:
        reply = llm_with_tools.invoke(messages)
    return {"messages": [reply]}


builder = StateGraph(MessagesState)
builder.add_node("agent", agent)
builder.add_node("tools", ToolNode(tools))

builder.add_edge(START, "agent")
# Cevapta araç çağrısı varsa "tools" düğümüne, yoksa END'e gider.
builder.add_conditional_edges("agent", tools_condition)
builder.add_edge("tools", "agent")

# Checkpointer (app/checkpoint.py): her adımdan sonra defterin (state) bir kopyasını veritabanına yazar.
# Aynı thread_id ile gelen sonraki istek, defteri kaldığı yerden açar.

graph = builder.compile(checkpointer=checkpointer)
