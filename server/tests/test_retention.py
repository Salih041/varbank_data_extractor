from datetime import datetime, timedelta, timezone

from app import retention
from app.agent.graph import graph
from tests.conftest import config_for, new_thread, use_fake_llm


def has_messages(thread):
    return bool(graph.get_state(config_for(thread)).values)


def test_recent_conversations_are_kept(monkeypatch, client):
    use_fake_llm(monkeypatch, "ok")
    thread = new_thread()
    client.post("/chat", json={"thread_id": thread, "message": "hi"})

    retention.delete_old_threads()
    assert has_messages(thread)


def test_conversations_older_than_7_days_are_deleted(monkeypatch, client):
    use_fake_llm(monkeypatch, "ok")
    thread = new_thread()
    client.post("/chat", json={"thread_id": thread, "message": "hi"})

    eight_days_later = datetime.now(timezone.utc) + timedelta(days=8)
    assert retention.delete_old_threads(now=eight_days_later) >= 1
    assert not has_messages(thread)


def test_cleanup_runs_at_most_once_an_hour(monkeypatch):
    started = []
    monkeypatch.setattr(retention.threading, "Thread", lambda target, daemon: type("T", (), {"start": lambda self: started.append(1)})())
    monkeypatch.setattr(retention, "last_run", {"time": 0.0})

    retention.cleanup_in_background()
    retention.cleanup_in_background()
    assert started == [1]
