"""Vercel entrypoint. Vercel's FastAPI support looks for an ASGI variable named `app`
in app.py; this re-exports the existing application unchanged. Locally, keep using
start.ps1 / start.sh (uvicorn backend.api.main:app)."""
from backend.api.main import app  # noqa: F401
