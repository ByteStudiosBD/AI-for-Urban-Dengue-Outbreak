#!/usr/bin/env bash
# Development mode: FastAPI with reload on :8000 and Vite with HMR on :5173 (proxies /api).
set -euo pipefail
cd "$(dirname "$0")"
[ -d .venv ] && source .venv/bin/activate
python -m uvicorn backend.api.main:app --reload --port 8000 &
API=$!
trap 'kill $API' EXIT
(cd frontend && npm run dev)
