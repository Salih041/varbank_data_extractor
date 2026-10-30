import groq
import httpx
import pytest

from app import rate_limit
from app.agent import graph as graph_module
from app.agent.graph import graph
from app.errors import error_code
from tests.conftest import config_for, new_thread, read_events, use_fake_llm

OTHER_INSTALL_ID = "9f8e7d6c-5b4a-4321-8fed-cba987654321"


def test_install_id_header_is_required(client):
    res = client.post("/chat", json={"thread_id": new_thread(), "message": "hi"}, headers={"X-Install-Id": ""})
    assert res.status_code == 422


def test_other_install_cannot_see_the_conversation(monkeypatch, client):
    use_fake_llm(monkeypatch, "Secret answer", "Fresh answer")
    thread = new_thread()

    client.post("/chat", json={"thread_id": thread, "message": "My private question"})
    # Aynı thread_id, farklı kurulum: boş bir defterle başlar.
    client.post("/chat", json={"thread_id": thread, "message": "Show me"}, headers={"X-Install-Id": OTHER_INSTALL_ID})

    assert [m.content for m in graph.get_state(config_for(thread)).values["messages"]] == [
        "My private question",
        "Secret answer",
    ]


def test_delete_removes_the_conversation(monkeypatch, client):
    use_fake_llm(monkeypatch, "Answer")
    thread = new_thread()
    client.post("/chat", json={"thread_id": thread, "message": "Question"})

    assert client.delete(f"/threads/{thread}").status_code == 204
    assert graph.get_state(config_for(thread)).values == {}


def test_rate_limit_per_ip(monkeypatch, client):
    use_fake_llm(monkeypatch, *["ok"] * rate_limit.PER_IP_PER_MINUTE)
    for _ in range(rate_limit.PER_IP_PER_MINUTE):
        assert client.post("/chat", json={"thread_id": new_thread(), "message": "hi"}).status_code == 200

    res = client.post("/chat", json={"thread_id": new_thread(), "message": "one more"})
    assert res.status_code == 429
    assert res.json() == {"detail": "RATE_LIMIT"}


def test_daily_total_limit(monkeypatch):
    rate_limit.reset()
    monkeypatch.setattr(rate_limit, "TOTAL_PER_DAY", 3)
    # Farklı kullanıcılar (IP'ler) olsa bile günlük toplam aşılamaz.
    assert [rate_limit.allow_request(f"10.0.0.{i}") for i in range(4)] == [True, True, True, False]


def test_huge_body_is_rejected_before_reading(client):
    res = client.post("/chat", content=b"x", headers={"Content-Length": "10000000", "Content-Type": "application/json"})
    assert res.status_code == 413


def groq_error(cls, status):
    request = httpx.Request("POST", "https://api.groq.com")
    return cls("hidden", response=httpx.Response(status, request=request), body=None)


@pytest.mark.parametrize(
    "error, code",
    [
        (groq_error(groq.RateLimitError, 429), "RATE_LIMIT"),
        (groq_error(groq.APIStatusError, 413), "TOO_LARGE"),
        (groq_error(groq.BadRequestError, 400), "BAD_RESPONSE"),
        (RuntimeError("anything"), "SERVER"),
    ],
)
def test_error_codes(error, code):
    assert error_code(error) == code


class RateLimitedLLM:
    def invoke(self, messages):
        raise groq_error(groq.RateLimitError, 429)


def test_groq_rate_limit_reaches_the_user_as_a_code(monkeypatch, client):
    monkeypatch.setattr(graph_module, "llm_with_tools", RateLimitedLLM())
    events = read_events(client.post("/chat", json={"thread_id": new_thread(), "message": "hi"}))
    assert events == [("error", {"code": "RATE_LIMIT"})]
