# DengueGuard AI — one-command local start (Windows PowerShell).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Test-Path .venv)) { python -m venv .venv }
. .\.venv\Scripts\Activate.ps1
python -m pip install -q --disable-pip-version-check -r requirements.txt
python -c "from backend.prediction_engine.engine import _load_artifacts; _load_artifacts()" 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "Training models (about 20 s)..."; python -m backend.ml_training.train }
Push-Location frontend
npm ci --no-audit --no-fund --loglevel=error
npm run build --silent
Pop-Location
Write-Host "DengueGuard AI running at http://localhost:8000"
python -m uvicorn backend.api.main:app --host 127.0.0.1 --port 8000
