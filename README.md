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
| **Landing** | Full-width hero on an operating-room photo with a navy overlay and white text, how it works, data coverage, prototype disclaimer |
| **Login / Demo** | The first page every visitor sees. Demo mode signs in with one click and lands on the homepage, or returns you to the page you originally opened. Optional local officer accounts (PBKDF2-hashed). Hospital-corridor photo panel whose text stays white and readable in both themes |
| **Risk Overview** (default) ★ | *Ward Risk Heatmap — Schematic View* in a three-pane GIS-style workspace: a **Data layers** pane (reference week, horizon, city, ward-ID search, risk-tier filters with counts, a histogram of predicted cases with the tier thresholds marked, tile label), a central canvas with map-style controls (larger/smaller tiles, tile label, reset), and an **Info** pane. All 60 dataset wards appear as tiles grouped by city, coloured from live model inference for the chosen reference week and 2/3/4-week horizon (green Low, blue Medium, red High or Critical; Critical also striped with a "C" marker). With no ward selected, the Info pane summarises the window, tier counts and highest-forecast wards; clicking a ward shows its exact 4-tier forecast, interval, risk score, all horizons, model drivers, weather and per-ward rainfall lags, vulnerability indicators, 52-week trends and every original record |
| **View Data** | The complete original dataset (31,320 rows, all 12 source columns, values unchanged) with city / ward / ID search / date filters, sorting on every column, server-side pagination and CSV download of the filtered rows. The ward panel links here pre-filtered to that ward |
| **Overview** | City cases this week, wards at High/Critical, selected-ward forecast with interval, ward weather, 26-week history + 2–4 week forecast chart, driver panel, lagged-rainfall chart, ward watchlist |
| **Risk Predictions** | Side-by-side 2/3/4-week forecasts, interval scale over tier zones, model inputs, provenance and evaluation status, tier and score formulas |
| **Risk Matrix (by week)** ★ | Ward × horizon and ward × reference-week matrices coloured by model tier, with hover details, click-through and sortable ranking. No invented geography |
| **Weather Data** | Weekly rainfall with toggleable 1–4 week lag series, temperature (avg/max/min), humidity, lag and rolling-total table |
| **Model Validation** ★ | Chronological split timeline, held-out MAE/RMSE per horizon vs. baseline, interval coverage, filterable actual-vs-predicted chart, candidate models, factor importance, error by city |
| **Everywhere** | EN / বাংলা switch; **dark / light theme toggle** (dark by default, choice remembered in the browser, no flash on reload); alerts count derived from real High/Critical forecasts; CSV export of the current city forecast; filters kept in the URL; site footer with project credit and a link to this GitHub repository |

★ = bonus features (ward-level heatmaps, multi-week prediction intervals, chronological MAE/RMSE dashboard).

### Phase 2: operations

Phase 2 turns the forecasts into an operational plan for ward commissioners and health-centre managers. It adds no new model: everything starts from the Phase 1 2/3/4-week forecasts and runs locally (no internet, no LLM).

| Page | What it does |
|---|---|
| **Resource Allocation** | Converts forecast cases into `saline_bags_needed`, `diagnostic_kits_needed` and `hospital_beds_required` with the per-case rule found in the onsite workbook. A stock slider (30–100% of demand) and a crew slider make supplies scarce; wards are prioritised by model risk and `population_density_sqkm`, and every ward below 100% is flagged live, with critical deficits highlighted. |
| **Hospital Overflow** | Compares bed demand with ward capacity and routes overflow patients to the least-loaded wards **within the same city**, showing per-ward routed out/in, net deficits, city-wide utilisation and remaining headroom. Every ward's capacity is editable. |
| **What-If Simulator** | Deploys a limited number of spraying crews (optimised or manual) and shows the 2-, 3- and 4-week reduction in cases, beds and saline, with wards ranked by cases prevented per crew. |
| **Dispatch Center** | Ward notices for SMS and WhatsApp (English or Bangla) and a printable HTML commissioner brief per city or for all wards, listing predicted cases, allocated vs required supplies, deficits, bed transfers and assigned crews. Sample exports are in [`dengueguard-ai/exports/`](dengueguard-ai/exports/). |

**Phase 2 assumptions.** The onsite workbook contains supply needs per case but no bed capacity, stock levels or spraying data. The supply rates are fitted from the workbook and reproduce all 31,320 rows exactly (saline ≈ 2.385, kits ≈ 1.164, beds ≈ 0.298 per case, rounded half-up). Ward bed capacity defaults to a *planning baseline capacity (editable assumption), derived from historical ward demand* (90th percentile of weekly beds required). Stock is a percentage of projected demand, and the per-crew effect is a user-set scenario parameter, not a proven causal estimate. Details: [ARCHITECTURE.md §14](ARCHITECTURE.md#14-phase-2-operations-allocation-overflow-simulator-dispatch).

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

### Optional: deploy on Vercel

The repository includes a Vercel configuration that runs the same FastAPI app as one Python function and builds the React UI during deployment:

- `dengueguard-ai/app.py`: entry point (re-exports `backend.api.main:app`);
- `dengueguard-ai/vercel.json`: frontend build command, 60 s max duration, and exclusion of tests, design files and docs from the server bundle;
- `dengueguard-ai/.python-version`: Python 3.12.

To deploy, import the repository in Vercel, set **Root Directory** to `dengueguard-ai`, keep the **FastAPI** preset, and deploy. No environment variables are needed. Vercel's servers are read-only, so the dataset loader keeps its cleaned data in memory when it cannot write the CSV cache. The first request after an idle period can take 5–15 s while the model loads and scores all wards.

### Tests

```bash
python -m pytest -q tests
```

```bash
cd frontend && npx tsc -b && npm run build
```

The 54 backend tests cover:
- schema and coverage of the dataset;
- Excel serial date parsing;
- lag correctness per ward and no cross-ward contamination;
- feature invariance when future weeks are altered (leakage);
- horizon target alignment and disjoint chronological splits;
- conformal interval properties;
- every API endpoint, including structured errors;
- dataset records returned unchanged, per-ward isolation (`DNCC_Ward_05` never mixes with `DSCC_Ward_05`), and all 60 wards forecast exactly once per week and horizon.
- Phase 2: supply rules reproduce every onsite workbook row, scarcity allocation by priority, overflow routing that stays within each city, the multi-week simulator and ROI ranking, and SMS / WhatsApp / brief content.

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
│   ├── operations/                        # Phase 2: supplies, planner, dispatch, export
│   └── api/main.py, auth.py               # FastAPI endpoints, demo auth
├── frontend/src/{pages,components,i18n,services,types,state}
├── data/        hackathon_preli_dataset.xlsx, bangladesh_dengue_large_dataset_onsite.xlsx, *.csv (generated)
├── exports/     sample SMS / WhatsApp / commissioner briefs (python -m backend.operations.export)
├── models/      trained_model.joblib (0.7 MB), model_metadata.json
├── design/      dashboard reference + supplied reference photos
├── docs/        official brief, rulebook and demo script
├── tests/
├── start.sh · start.ps1 · dev.sh · requirements.txt
└── app.py · vercel.json · .python-version   # Vercel deployment
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
| `GET /api/ops/assumptions` | Fitted supply rates, per-ward planning capacity, scenario defaults |
| `POST /api/ops/plan` | Allocation, overflow routing, crews and 2–4-week simulation for one scenario |
| `POST /api/ops/dispatch` · `POST /api/ops/brief` | SMS / WhatsApp notices (`en` / `bn`) and the printable HTML brief |
| `POST /api/auth/demo` · `POST /api/auth/login` · `GET /api/auth/me` · `POST /api/auth/logout` | Demo / local auth |

Interactive docs: http://localhost:8000/docs

## Team

**Team name:** Byte Studios · **Project:** DengueGuard AI

| Name | GitHub | Role |
|---|---|---|
| Sheikh Sifat Hakim | [@sifat252212](https://github.com/sifat252212) | Team Leader & Developer |
| Taki Tazwar Moon | [@codertazwar](https://github.com/codertazwar) |  Desginer & Developer |



## AI tools and external API disclosure

| Tool / API | Used for |
|---|---|
| **Claude Code** (Anthropic, Claude models; via claude.ai/code and the VS Code extension) | Software implementation, debugging, UI development and documentation assistance: inspected the brief, rulebook, dataset and design references; implemented the data pipeline, models, FastAPI backend, React frontend, tests, start scripts and this documentation, under the team's direction and review. |
| **Impeccable** skill (open source, `pbakaus/impeccable`, Apache-2.0), loaded into Claude Code | Design-quality guidance (contrast, states, motion and type checklist) during UI work. |
| **ChatGPT** (OpenAI) | Planning and review, not code in this repository: interpreting the official hackathon requirements and evaluation criteria; planning the dashboard UI/UX; researching geographic mapping options and assessing dataset limitations; designing the ward-level heatmap interaction strategy; preparing implementation prompts and development instructions for Claude Code; reviewing project features against the hackathon requirements; guidance on documentation and submission preparation. |

**At runtime:** no LLM, model endpoint or external API is called. All predictions come from the locally trained scikit-learn models, and the token cost is zero.

## Attributions

- **Dataset:** official hackathon dataset supplied by the organizers (EDU Computer Club / XPONENT).
- **Design reference:** `design/dashboard-reference.png`, a third-party dribbble-style concept used only as layout inspiration. No content was copied.
- **Fonts:** Manrope and Noto Sans Bengali, SIL Open Font License 1.1.
- **Libraries:** see `requirements.txt` and `frontend/package.json`; all are open source under their own licences. No significant third-party code snippets were copied.

## Demo

- **Local:** `./start.sh` (macOS / Linux) or `.\start.ps1` (Windows), then http://localhost:8000
- **Deployed URL:** https://ai-for-urban-dengue-outbreak.vercel.app/ (Vercel; the first load after an idle period can take a few seconds)
- **Video (uncut, live on localhost, with voiceover):** https://drive.google.com/file/d/1vshry-op_KK2Mam1Cor8LemHZMGhm7AS/view?usp=sharing. It follows [`dengueguard-ai/docs/DEMO_SCRIPT.md`](dengueguard-ai/docs/DEMO_SCRIPT.md).

## Recent changes

Changes merged into `main` since the previous README update (each pull request reviewed and merged by the team):

| PR | Author | Change |
|---|---|---|
| #8 | codertazwar | **Vercel deployment support:** `app.py` entry point, `vercel.json` (frontend build, function limits, bundle exclusions) and `.python-version`; the dataset loader now keeps its data in memory instead of crashing when the filesystem is read-only. |
| #9 | sifat252212 | **Site footer** on every page: project name, "Developed by Byte Studios, EDU AI Engineering Hackathon 2026", a **GitHub Repo** button linking to this repository (opens in a new tab) and the copyright line. The homepage keeps its Overview / Model Validation / Sign in links above it. |
| #10 | sifat252212 | **Dark / light theme system:** a pill-shaped sun/moon toggle in the top bar, homepage header and sign-in page; a warm cream light palette (`#FBF6EA` background, white cards, `#172033` text) defined once as CSS colour tokens; theme-aware charts, tooltips, dropdowns, inputs and buttons; the choice is saved in the browser and applied before first paint. Dark remains the default and is unchanged. |
| #11 | codertazwar | **Theme-aware pages:** the Risk Overview workspace, Risk Matrix, Weather Data, data tables, ward panel and footer now follow the active theme (the footer is cream in light mode and a dark band in dark mode). The Risk Overview's green / blue / red tile colours and all thresholds are identical in both themes; only the 4-tier badge text uses slightly deeper shades of the same hues in light mode for readability. |
| #11 | codertazwar | **Sign-in page photo** replaced with a hospital-corridor image under a fixed dark overlay, so its heading and tagline stay white and readable in both themes and in Bangla. |
| #14 | sifat252212 | **Sign-in first:** every page, including the homepage, now requires a session (demo or account). Visitors are sent to the sign-in page and returned to the page they asked for afterwards. Only same-site paths are accepted as the return address. |
| #15 | sifat252212 | **Homepage after sign-in and fresh deployments:** demo or account sign-in now lands on the homepage instead of the dashboard. The server sends `index.html` with `no-cache` and the content-hashed `/assets` files as long-lived `immutable`, so a new deployment can no longer show a blank page from a stale cached copy. |
| #16 | sifat252212 | **ARCHITECTURE.md** rewritten to cover the full current system: API reference, frontend architecture, sign-in flow, caching, Vercel deployment and tests. |

No changes were made to the prediction engine, weather-lag pipeline, dataset, model outputs or API responses in these updates. The only server changes were the read-only-safe dataset cache in #8 and the cache headers in #15.
