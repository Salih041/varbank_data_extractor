import pytest
from pydantic import ValidationError

from app.config import Settings
from app.schemas import HARD_MAX_ATTACHMENT_CHARS, MAX_USER_MESSAGE_CHARS, ChatRequest

THREAD = "6f1c2a4e-8b7d-4e1a-9c3f-2d5e7a9b1c0d"


def test_valid_request_strips_whitespace():
    req = ChatRequest(thread_id=THREAD, message="  Which variants are pathogenic?  ")
    assert req.message == "Which variants are pathogenic?"
    assert req.attachment is None


@pytest.mark.parametrize(
    "body",
    [
        {"thread_id": THREAD, "message": "   "},
        {"thread_id": THREAD, "message": "x" * (MAX_USER_MESSAGE_CHARS + 1)},
        {"thread_id": THREAD, "message": "hi", "attachment": "x" * (HARD_MAX_ATTACHMENT_CHARS + 1)},
        {"thread_id": "not-a-uuid", "message": "hi"},
        {"message": "hi"},
        {"thread_id": THREAD, "message": "hi", "model": "other"},
    ],
)
def test_invalid_requests_are_rejected(client, body):
    with pytest.raises(ValidationError):
        ChatRequest(**body)
    assert client.post("/chat", json=body).status_code == 422


def test_api_key_is_hidden_when_printed():
    s = Settings(_env_file=None, groq_api_key="gsk_FAKEtest12345")
    assert "gsk_FAKEtest12345" not in repr(s)
    assert s.groq_api_key.get_secret_value() == "gsk_FAKEtest12345"
