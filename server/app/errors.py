# Hataları eklentinin anlayacağı kısa kodlara çevirir.
# Hatanın kendi mesajı asla dışarı verilmez: içinde anahtar veya kullanıcı verisi olabilir.

import groq
from langgraph.errors import GraphRecursionError


def error_code(error: Exception) -> str:
    if isinstance(error, groq.RateLimitError):
        return "RATE_LIMIT"  # Groq'un dakikalık/günlük kotası doldu
    if isinstance(error, groq.APIStatusError) and error.status_code == 413:
        return "TOO_LARGE"  # tek istek, Groq'un dakikalık token sınırından büyük
    if isinstance(error, groq.BadRequestError):
        return "BAD_RESPONSE"  # model bozuk bir araç çağrısı üretti
    if isinstance(error, GraphRecursionError):
        return "TOO_MANY_STEPS"  # agent adım sınırına takıldı
    return "SERVER"


def retry_after(error: Exception) -> int | None:
    # Groq kota hatasında "şu kadar saniye sonra tekrar dene" bilgisini verir.
    if not isinstance(error, groq.RateLimitError):
        return None
    try:
        seconds = float(error.response.headers.get("retry-after", ""))
    except ValueError:
        return None
    return max(1, min(120, round(seconds)))
