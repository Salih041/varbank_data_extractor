# Table Extractor – Agent server

Python backend for the Table Extractor extension: a LangGraph agent served with FastAPI.

## Requirements

- Python 3.11+
- [uv](https://docs.astral.sh/uv/) (package and virtual-environment manager)

## Run locally

```bash
cd server
uv sync
uv run uvicorn app.main:app --reload
```

- Health check: <http://localhost:8000/health>
- Interactive API docs: <http://localhost:8000/docs>

Copy `.env.example` to `.env` and fill in the keys first (`ACCESS_KEY` must be at least 12 characters).

## Tests and evaluation

```bash
uv run pytest
```

Unit tests use a fake LLM and fake search (no network, no quota).

```bash
uv run python -m evals.run_evals
```

Runs 8 scenarios against the real model and Tavily (uses quota) and writes `evals/results.md`.

## Configuration

| Variable | Meaning |
|---|---|
| `GROQ_API_KEY`, `TAVILY_API_KEY` | Model and web search keys (server only) |
| `ACCESS_KEY` | Shared key the extension must send (`Authorization: Bearer …`), ≥ 12 chars |
| `GROQ_MODEL` | Groq model, default `openai/gpt-oss-120b` |
| `MAX_HISTORY_TOKENS` | History sent per model call (default 3000, for Groq's free 8K tokens/minute) |
| `DATABASE_URL` | Postgres (e.g. Neon) for conversations; if empty, `CHECKPOINT_DB` SQLite file is used |
| `ALLOWED_ORIGIN` | `chrome-extension://<id>` for CORS |
| `TRUST_PROXY_HEADERS` | `true` behind Cloud Run (client IP from `X-Forwarded-For`); set in the Dockerfile |

Conversations not used for 7 days are deleted automatically.

## Deploy

The `Dockerfile` targets Google Cloud Run (`gcloud run deploy --source .`), with secrets in Secret Manager and Postgres on Neon.
