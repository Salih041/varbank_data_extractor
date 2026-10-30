from app import auth
from tests.conftest import ACCESS_KEY, new_thread, use_fake_llm

WRONG = {"Authorization": "Bearer wrong-key-123456"}


def chat_body():
    return {"thread_id": new_thread(), "message": "hi"}


def test_correct_key_is_accepted(monkeypatch, client):
    use_fake_llm(monkeypatch, "ok")
    assert client.post("/chat", json=chat_body()).status_code == 200
    assert client.get("/auth/check").status_code == 204


def test_wrong_or_missing_key_is_rejected(client):
    assert client.post("/chat", json=chat_body(), headers=WRONG).status_code == 401
    assert client.post("/chat", json=chat_body(), headers={"Authorization": ""}).json() == {"detail": "BAD_ACCESS_KEY"}
    # Önek olmadan, yalnızca anahtar da kabul edilmez.
    assert client.get("/auth/check", headers={"Authorization": ACCESS_KEY}).status_code == 401


def test_delete_needs_the_key(client):
    assert client.delete(f"/threads/{new_thread()}", headers=WRONG).status_code == 401
    assert client.delete(f"/threads/{new_thread()}").status_code == 204


def test_health_is_open(client):
    assert client.get("/health", headers={"Authorization": ""}).status_code == 200


def test_too_many_wrong_attempts_lock_the_ip(client):
    for _ in range(auth.MAX_FAILED_ATTEMPTS):
        assert client.get("/auth/check", headers=WRONG).status_code == 401

    # Artık doğru anahtar bile kabul edilmez (anahtar deneme yanılmayla bulunamasın).
    res = client.get("/auth/check")
    assert res.status_code == 429
    assert res.json() == {"detail": "TOO_MANY_ATTEMPTS"}


def test_lock_ends_after_the_window(monkeypatch, client):
    for _ in range(auth.MAX_FAILED_ATTEMPTS):
        client.get("/auth/check", headers=WRONG)

    real_time = auth.time.time
    monkeypatch.setattr(auth.time, "time", lambda: real_time() + auth.WINDOW_SECONDS + 1)
    assert client.get("/auth/check").status_code == 204
