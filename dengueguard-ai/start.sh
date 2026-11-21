#!/usr/bin/env bash
# DengueGuard AI — one-command local start (macOS / Linux).
# Installs deps, trains models only if artifacts are missing, builds the UI,
# and serves everything at http://localhost:8000
set -euo pipefail
cd "$(dirname "$0")"
PY=${PYTHON:-python3}

if [ ! -d .venv ]; then "$PY" -m venv .venv; fi
# shellcheck disable=SC1091
source .venv/bin/activate
python -m pip install -q --disable-pip-version-check -r requirements.txt

if [ ! -f models/trained_model.joblib ] || ! python -c "from backend.prediction_engine.engine import _load_artifacts; _load_artifacts()" 2>/dev/null; then
  echo "Model artifacts missing or incompatible: training (about 20 s)…"
  python -m backend.ml_training.train
fi

(cd frontend && npm ci --no-audit --no-fund --loglevel=error && npm run build --silent)

echo "DengueGuard AI running at http://localhost:8000"
exec python -m uvicorn backend.api.main:app --host 127.0.0.1 --port "${PORT:-8000}"
