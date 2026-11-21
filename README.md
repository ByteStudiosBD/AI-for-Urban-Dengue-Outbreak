# DengueGuard AI — Ward-Level Dengue Early Warning

**EDU AI Engineering Hackathon 2026 · Challenge: AI for Urban Dengue Outbreak**

DengueGuard AI forecasts weekly dengue cases for each of 60 city-corporation wards in Bangladesh, **2, 3 and 4 weeks ahead**. Inputs are weekly rainfall, temperature and humidity, transformed into per-ward rainfall lags that follow the mosquito breeding clock. Every forecast comes with:

- a **Low / Medium / High / Critical** risk tier;
- a **calibrated 90% prediction interval**;
- a **driver breakdown**.

Public health officers can see which wards to target before cases climb.

> Decision-support prototype built on the supplied historical dataset (2016–2025). Forecasts are model estimates, not clinical advice or official alerts.

## Features

| Page | What it shows |
|---|---|
| **Landing** | Hero collage from the three supplied hospital photos, how it works, data coverage, prototype disclaimer |
| **Login / Demo** | Demo mode with one click; optional local officer accounts (PBKDF2-hashed). Never blocks exploration |
| **Risk Overview** (default) ★ | *Ward Risk Heatmap — Schematic View*: all 60 dataset wards as tiles grouped by city, coloured from live model inference for the chosen reference week and 2/3/4-week horizon (green Low, blue Medium, red High or Critical; Critical also striped with a "C" marker). Filters for city, ward ID, risk tier and tile label. Clicking a ward opens a panel with its exact 4-tier forecast, interval, risk score, all horizons, model drivers, weather and per-ward rainfall lags, vulnerability indicators, 52-week trends and every original record |
| **View Data** | The complete original dataset (31,320 rows, all 12 source columns, values unchanged) with city / ward / ID search / date filters, sorting on every column, server-side pagination and CSV download of the filtered rows. The ward panel links here pre-filtered to that ward |
| **Overview** | City cases this week, wards at High/Critical, selected-ward forecast with interval, ward weather, 26-week history + 2–4 week forecast chart, driver panel, lagged-rainfall chart, ward watchlist |
| **Risk Predictions** | Side-by-side 2/3/4-week forecasts, interval scale over tier zones, model inputs, provenance and evaluation status, tier and score formulas |
| **Ward Risk Heatmap (Matrix)** ★ | Ward × horizon and ward × reference-week matrices coloured by model tier, with hover details, click-through and sortable ranking. No invented geography |
| **Weather Data** | Weekly rainfall with toggleable 1–4 week lag series, temperature (avg/max/min), humidity, lag and rolling-total table |
| **Model Validation** ★ | Chronological split timeline, held-out MAE/RMSE per horizon vs. baseline, interval coverage, filterable actual-vs-predicted chart, candidate models, factor importance, error by city |
| **Everywhere** | EN / বাংলা switch, alerts count derived from real High/Critical forecasts, CSV export of the current city forecast, filters kept in the URL |

★ = bonus features (ward-level heatmaps, multi-week prediction intervals, chronological MAE/RMSE dashboard).

**Data limitations.** The dataset has no coordinates or official ward codes, and its ward IDs (for example `DNCC_Ward_05`) are dataset identifiers that may not match official ward numbers. No ward boundary data was used, so the heatmaps are schematic and do not show geographic position. All data is historical (4 Jan 2016 – 29 Dec 2025), not a live feed.

**Held-out test results** (target weeks 2024–2025, 6,300 ward-weeks per horizon):

| Horizon | Model | MAE | RMSE | 4-week-mean baseline MAE | 90% PI coverage |
|---|---|---|---|---|---|
| 2 weeks | HistGradientBoosting (squared error) | 1.05 | 2.04 | 1.73 | 92.4% |
| 3 weeks | HistGradientBoosting (squared error) | 1.06 | 2.06 | 1.94 | 93.9% |
| 4 weeks | HistGradientBoosting (Poisson) | 1.16 | 2.28 | 2.15 | 94.0% |

## Setup and run (≤ 3 minutes)

**Requirements:** Python **3.11+**, Node.js **20.19+ or 22.12+**, and npm. No database, API keys or environment variables are needed.

```bash
git clone https://github.com/ByteStudiosBD/AI-for-Urban-Dengue-Outbreak.git
```

```bash
cd AI-for-Urban-Dengue-Outbreak/dengueguard-ai
```

macOS / Linux:

```bash
./start.sh
```

Windows (PowerShell). The first command allows the script to run in this window only:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
```

```powershell
.\start.ps1
```

On Windows, `python` must be a real Python install, not the Microsoft Store shortcut. If Python or Node.js is missing, install them with winget and then open a new PowerShell window:

```powershell
winget install -e --id Python.Python.3.12
```

```powershell
winget install -e --id OpenJS.NodeJS.LTS
```

Then open **http://localhost:8000**.

The script does the following:
1. creates `.venv` and installs `requirements.txt`;
2. checks that the committed model in `models/` loads, and retrains (about 20 s) only if it is missing or incompatible;
3. runs `npm ci` and builds the UI;
4. serves the UI and API together from FastAPI on port 8000.

A clean clone took 26 s with warm package caches. Expect about 1–2 minutes on a fresh machine.

### Manual commands

```bash
python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
```

```bash
python -m backend.data_processing.loader     # XLSX -> data/dataset.csv + coverage report
```

```bash
python -m backend.ml_training.train          # trains, evaluates and saves models/ (~20 s)
```

```bash
python -m uvicorn backend.api.main:app --port 8000
```

```bash
cd frontend && npm ci && npm run dev         # http://localhost:5173 (proxies /api to :8000)
```

Or run both servers with hot reload: `./dev.sh`.

### Tests

```bash
python -m pytest -q tests
```

```bash
cd frontend && npx tsc -b && npm run build
```

The 41 backend tests cover:
- schema and coverage of the dataset;
- Excel serial date parsing;
- lag correctness per ward and no cross-ward contamination;
- feature invariance when future weeks are altered (leakage);
- horizon target alignment and disjoint chronological splits;
- conformal interval properties;
- every API endpoint, including structured errors;
- dataset records returned unchanged, per-ward isolation (`DNCC_Ward_05` never mixes with `DSCC_Ward_05`), and all 60 wards forecast exactly once per week and horizon.

`tests/e2e_smoke.cjs` loads every route in a headless browser and fails on console errors.

### Optional: officer account

Demo mode needs nothing. To try real sign-in, create a local account. The password is stored as a salted PBKDF2 hash in the git-ignored `backend/auth_users.json`.

```bash
python -m backend.api.auth add officer@example.org
```

## Tech stack

| Layer | Tools |
|---|---|
| Backend | Python 3.11+, FastAPI, Uvicorn, Pandas, NumPy, scikit-learn (HistGradientBoostingRegressor, PoissonRegressor), joblib, openpyxl |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, Radix UI primitives in shadcn/ui-style components (written by hand, not via the shadcn CLI), class-variance-authority, Lucide React, Recharts, Motion, React Router |
| Fonts | Manrope, Noto Sans Bengali (self-hosted via Fontsource, SIL OFL 1.1) |
| Data | `data/hackathon_preli_dataset.xlsx`, the official dataset supplied with the challenge |

## Project structure

```text
dengueguard-ai/
├── backend/
│   ├── data_processing/loader.py          # XLSX -> validated, sorted CSV
│   ├── rainfall_lag_pipeline/features.py  # per-ward lag / rolling features
│   ├── ml_training/train.py               # split, select, calibrate, evaluate, save
│   ├── prediction_engine/engine.py        # load once, batch-score, explanations
│   └── api/main.py, auth.py               # FastAPI endpoints, demo auth
├── frontend/src/{pages,components,i18n,services,types,state}
├── data/        hackathon_preli_dataset.xlsx, dataset.csv (generated)
├── models/      trained_model.joblib (0.7 MB), model_metadata.json
├── design/      dashboard reference + 3 hospital photos
├── docs/        official brief and rulebook
├── tests/
└── start.sh · start.ps1 · dev.sh · requirements.txt
```

Architecture, split logic, model choice, calibration and cost controls are covered in [ARCHITECTURE.md](ARCHITECTURE.md).

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Model loaded? |
| `GET /api/metadata` | Cities, wards, coverage, available weeks, tier and interval config |
| `GET /api/observations?city=&ward_id=&from=&to=` | Weekly observations (ward rows or city aggregates) |
| `GET /api/weather-lags?ward_id=&as_of=&weeks=` | Lag 1–4 rainfall, rolling totals, recent series |
| `GET /api/records?city=&ward_id=&q=&from=&to=&sort=&order=&page=&page_size=&format=` | Original dataset rows (12 source columns, unchanged), filtered, sorted and paginated; `format=csv` downloads every matching row |
| `GET /api/predict?ward_id=&as_of=&horizon_weeks=` | One forecast with interval, tier, score, drivers, test metrics |
| `GET /api/predict-horizons?ward_id=&as_of=` | All three horizons in one call |
| `GET /api/predict-all?city=&as_of=&horizon_weeks=` | Batch city forecasts, tier counts, alert count |
| `GET /api/heatmap?city=&as_of=&weeks=` | Ward × horizon and ward × week matrices |
| `GET /api/validation?horizon_weeks=` | Split ranges, candidates, test MAE/RMSE, coverage, importance, by-city error |
| `GET /api/validation-series?horizon_weeks=&ward_id=\|city=&from=&to=` | Actual vs predicted series |
| `POST /api/auth/demo` · `POST /api/auth/login` · `GET /api/auth/me` · `POST /api/auth/logout` | Demo / local auth |

Interactive docs: http://localhost:8000/docs

## Team

**Team name:** Byte Studios · **Project:** DengueGuard AI

| Name | GitHub | Role |
|---|---|---|
| Sheikh Sifat Hakim | [@sifat252212](https://github.com/sifat252212) | Team Leader & Developer |
| Taki Tazwar Moon | [@codertazwar](https://github.com/codertazwar) |  Desginer & Developer |

> **TODO (team):** confirm each member's role and who the Team Leader is.

## AI tools and external API disclosure

| Tool / API | Used for |
|---|---|
| **Claude Code** (Anthropic, Claude models, via claude.ai/code) | Inspected the brief, rulebook, dataset and design references. Implemented the data pipeline, models, FastAPI backend, React frontend, tests, start scripts and this documentation, under the team's direction and review. |
| **Impeccable** skill (open source, `pbakaus/impeccable`, Apache-2.0), loaded into Claude Code | Design-quality guidance (contrast, states, motion and type checklist) during UI work. |
| **ChatGPT** (OpenAI) | **TODO (team): confirm and describe use** — for example, drafting the implementation prompt. Remove this row if it was not used. |

**At runtime:** no LLM, model endpoint or external API is called. All predictions come from the locally trained scikit-learn models, and the token cost is zero.

## Attributions

- **Dataset:** official hackathon dataset supplied by the organizers (EDU Computer Club / XPONENT).
- **Homepage hero photo** (`frontend/src/assets/photos/operating-room-hero.png`, operating-room team): supplied by the team. **TODO (team): add its source and licence.**
- **Photos** (`design/medical-*.{png,jpg}`): supplied by the team; `medical-corridor.jpg` is used on the sign-in page. **TODO (team): add each photo's source and licence.** Clear the rights before using them outside the hackathon demo.
- **Design reference:** `design/dashboard-reference.png`, a third-party dribbble-style concept used only as layout inspiration. No content was copied.
- **Fonts:** Manrope and Noto Sans Bengali, SIL Open Font License 1.1.
- **Libraries:** see `requirements.txt` and `frontend/package.json`; all are open source under their own licences. No significant third-party code snippets were copied.

## Demo

- **Local:** `./start.sh` (macOS / Linux) or `.\start.ps1` (Windows), then http://localhost:8000
- **Video (2 min, uncut, live on localhost, with voiceover):** **TODO (team): add link.** The suggested walkthrough is in [`dengueguard-ai/docs/DEMO_SCRIPT.md`](dengueguard-ai/docs/DEMO_SCRIPT.md).
