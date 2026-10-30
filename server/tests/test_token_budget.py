import groq
import httpx
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from app.agent import graph as graph_module
from app.errors import retry_after
from tests.conftest import read_events, new_thread, use_fake_llm


def search_turn(question, query, call_id, answer):
    return [
        HumanMessage(question),
        AIMessage("", tool_calls=[{"name": "web_search", "args": {"query": query}, "id": call_id}]),
        ToolMessage("<<<WEB_RESULTS long results WEB_RESULTS>>>", tool_call_id=call_id, name="web_search"),
        AIMessage(answer),
    ]


def test_old_search_steps_are_not_sent_again():
    messages = search_turn("Q1", "BRCA2", "c1", "A1") + [HumanMessage("Q2")]
    kept = graph_module.without_old_searches(messages)
    assert [m.content for m in kept] == ["Q1", "A1", "Q2"]


def test_searches_of_the_current_question_are_kept():
    messages = [HumanMessage("Q1")] + search_turn("Q2", "PEX10", "c2", "A2")[1:3]
    kept = graph_module.without_old_searches(messages)
    assert len(kept) == 3  # soru, arama isteği ve sonucu: model sonuçları okuyabilmeli


def test_old_ask_user_questions_are_kept():
    ask = AIMessage("", tool_calls=[{"name": "ask_user", "args": {"question": "Which disease?"}, "id": "a1"}])
    answer = ToolMessage("The user answered: Zellweger", tool_call_id="a1", name="ask_user")
    messages = [HumanMessage("Q1"), ask, answer, AIMessage("A1"), HumanMessage("Q2")]
    assert graph_module.without_old_searches(messages) == messages


class RecordingLLM:
    def invoke(self, messages):
        self.seen = messages
        return AIMessage("ok")


def test_a_question_larger_than_the_budget_is_still_sent(monkeypatch):
    recorder = RecordingLLM()
    monkeypatch.setattr(graph_module, "llm_with_tools", recorder)
    graph_module.agent({"messages": [HumanMessage("x" * 100_000)]})
    assert isinstance(recorder.seen[0], SystemMessage)
    assert recorder.seen[1].content == "x" * 100_000


def rate_limit_error(seconds):
    request = httpx.Request("POST", "https://api.groq.com")
    response = httpx.Response(429, request=request, headers={"retry-after": seconds})
    return groq.RateLimitError("hidden", response=response, body=None)


def test_retry_after_is_read_from_groq():
    assert retry_after(rate_limit_error("7.2")) == 7
    assert retry_after(rate_limit_error("abc")) is None
    assert retry_after(RuntimeError("x")) is None


class RateLimitedLLM:
    def invoke(self, messages):
        raise rate_limit_error("12")


def test_rate_limit_event_carries_retry_time(monkeypatch, client):
    monkeypatch.setattr(graph_module, "llm_with_tools", RateLimitedLLM())
    events = read_events(client.post("/chat", json={"thread_id": new_thread(), "message": "hi"}))
    assert events == [("error", {"code": "RATE_LIMIT", "retry_after": 12})]
