# İsteği gönderen kullanıcının IP adresi (hız sınırı ve yanlış anahtar kilidi için).
# Cloud Run'da istekler Google'ın ön sunucusundan gelir; gerçek adres X-Forwarded-For başlığındadır.
# Kullanıcı bu başlığa kendi değerini de yazabilir, Google gerçek adresi SONA ekler; bu yüzden son
# değer alınır. Yerelde (TRUST_PROXY_HEADERS=false) başlığa hiç bakılmaz.

from fastapi import Request

from app.config import settings


def client_ip(request: Request) -> str:
    if settings.trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for", "")
        parts = [p.strip() for p in forwarded.split(",") if p.strip()]
        if parts:
            return parts[-1]
    return request.client.host if request.client else "unknown"
