# DengueGuard AI — one-command local start (Windows PowerShell).
# Native tools (python, pip, npm, uvicorn) write normal progress to stderr, which
# Windows PowerShell 5.1 turns into errors under "Stop". So we keep "Continue" and
# check each step's exit code ourselves.
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

function Assert-Step($what) {
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: $what failed (exit code $LASTEXITCODE)." -ForegroundColor Red
        exit 1
    }
}

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Python not found. Install it with: winget install -e --id Python.Python.3.12" -ForegroundColor Red
    exit 1
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: npm not found. Install Node.js with: winget install -e --id OpenJS.NodeJS.LTS" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path .venv)) {
    python -m venv .venv
    Assert-Step "Creating the virtual environment"
}
. .\.venv\Scripts\Activate.ps1

python -m pip install -q --disable-pip-version-check -r requirements.txt
Assert-Step "Installing Python packages"

# Retrain only if the committed model is missing or cannot be loaded.
$null = cmd /c "python -c ""from backend.prediction_engine.engine import _load_artifacts; _load_artifacts()"" 2>nul"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Training models (about 20 s)..."
    python -m backend.ml_training.train
    Assert-Step "Training the models"
}

Push-Location frontend
npm ci --no-audit --no-fund --loglevel=error
Assert-Step "Installing frontend packages (npm ci)"
npm run build --silent
Assert-Step "Building the frontend"
Pop-Location

Write-Host "DengueGuard AI running at http://localhost:8000"
python -m uvicorn backend.api.main:app --host 127.0.0.1 --port 8000
