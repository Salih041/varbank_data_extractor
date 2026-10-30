from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.agent import graph as graph_module
from app.agent.graph import graph
from tests.conftest import config_for, new_thread, use_fake_llm


def saved_messages(thread_id):
    # Checkpointer'ın o konuşma için sakladığı mesajlar.
    return graph.get_state(config_for(thread_id)).values["messages"]


def test_same_thread_remembers_previous_messages(monkeypatch, client):
    use_fake_llm(monkeypatch, "PEX10 is a peroxisome gene.", "You asked about PEX10.")
    thread = new_thread()

    client.post("/chat", json={"thread_id": thread, "message": "What does PEX10 do?"})
    client.post("/chat", json={"thread_id": thread, "message": "What did I just ask?"})

    contents = [m.content for m in saved_messages(thread)]
    assert contents == [
        "What does PEX10 do?",
        "PEX10 is a peroxisome gene.",
        "What did I just ask?",
        "You asked about PEX10.",
    ]


def test_different_threads_do_not_mix(monkeypatch, client):
    use_fake_llm(monkeypatch, "Answer A", "Answer B")
    thread_a, thread_b = new_thread(), new_thread()

    client.post("/chat", json={"thread_id": thread_a, "message": "Question A"})
    client.post("/chat", json={"thread_id": thread_b, "message": "Question B"})

    assert [m.content for m in saved_messages(thread_a)] == ["Question A", "Answer A"]
    assert [m.content for m in saved_messages(thread_b)] == ["Question B", "Answer B"]


class RecordingLLM:
    # Modele ne gönderildiğini kaydeder.
    def invoke(self, messages):
        self.seen = messages
        return AIMessage("ok")


def test_old_messages_are_dropped_when_history_is_too_long(monkeypatch):
    recorder = RecordingLLM()
    monkeypatch.setattr(graph_module, "llm_with_tools", recorder)
    huge_table = "x" * 200_000  # tek başına sınırın çok üstünde

    graph_module.agent({"messages": [
        HumanMessage(f"Old question with data {huge_table}"),
        AIMessage("Old answer"),
        HumanMessage("New question"),
    ]})

    assert isinstance(recorder.seen[0], SystemMessage)
    assert [m.content for m in recorder.seen[1:]] == ["New question"]
