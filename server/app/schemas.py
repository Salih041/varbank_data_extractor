# İstek modeli. Kurallara uymayan istek otomatik olarak 422 hatası alır.
# Sınırlar eklentideki src/shared/limits.js ile aynı.

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

MAX_USER_MESSAGE_CHARS = 8_000
HARD_MAX_ATTACHMENT_CHARS = 120_000


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    thread_id: UUID
    message: str = Field(min_length=1, max_length=MAX_USER_MESSAGE_CHARS)
    attachment: str | None = Field(default=None, max_length=HARD_MAX_ATTACHMENT_CHARS)
