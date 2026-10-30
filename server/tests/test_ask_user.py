from langchain_core.messages import HumanMessage, ToolMessage

from app.agent.graph import graph
from app.agent.tools import MAX_OPTION_CHARS, MAX_OPTIONS
from tests.conftest import ask_call, config_for, new_thread, read_events, use_fake_llm

QUESTION = "Which disease are you interested in?"
OPTIONS = ["Breast cancer", "Zellweger syndrome"]


def state_of(thread):
    return graph.get_state(config_for(thread))


def test_agent_asks_and_waits(monkeypatch, client):
    use_fake_llm(monkeypatch, ask_call(QUESTION, OPTIONS))
    thread = new_thread()

    events = read_events(client.post("/chat", json={"thread_id": thread, "message": "Is this variant relevant?"}))

    assert events == [("question", {"question": QUESTION, "options": OPTIONS}), ("done", {})]
    # Grafik durdu ve cevabı bekliyor.
    assert state_of(thread).interrupts


def test_next_message_is_the_answer_and_graph_continues(monkeypatch, client):
    use_fake_llm(monkeypatch, ask_call(QUESTION, OPTIONS), "For breast cancer, BRCA2 is the relevant gene.")
    thread = new_thread()

    client.post("/chat", json={"thread_id": thread, "message": "Is this variant relevant?"})
    events = read_events(client.post("/chat", json={"thread_id": thread, "message": "Breast cancer"}))

    text = "".join(data["text"] for name, data in events if name == "token")
    assert text == "For breast cancer, BRCA2 is the relevant gene."
    assert not state_of(thread).interrupts

    messages = state_of(thread).values["messages"]
    # Cevap yeni bir kullanıcı mesajı olarak değil, ask_user aracının sonucu olarak kaydedilir.
    assert [m.content for m in messages if isinstance(m, HumanMessage)] == ["Is this variant relevant?"]
    tool_results = [m.content for m in messages if isinstance(m, ToolMessage)]
    assert tool_results == ["The user answered: Breast cancer"]


def test_options_are_limited(monkeypatch, client):
    many = [f"Option {i} " + "x" * 200 for i in range(10)]
    use_fake_llm(monkeypatch, ask_call(QUESTION, many))

    events = read_events(client.post("/chat", json={"thread_id": new_thread(), "message": "Help"}))
    options = events[0][1]["options"]

    assert len(options) == MAX_OPTIONS
    assert all(len(o) <= MAX_OPTION_CHARS for o in options)
