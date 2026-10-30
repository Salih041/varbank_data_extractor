# Agent sunucusu imajı (Cloud Run). Bağımlılıklar uv.lock'taki sürümlerle birebir kurulur.
FROM python:3.11-slim

# uv.lock'u üreten sürümle aynı (uv --version).
COPY --from=ghcr.io/astral-sh/uv:0.13.6 /uv /bin/uv

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONUNBUFFERED=1

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY app ./app

ENV PATH="/app/.venv/bin:$PATH" TRUST_PROXY_HEADERS=true

# Cloud Run dinlenecek portu PORT ortam değişkeniyle verir (varsayılan 8080).
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
