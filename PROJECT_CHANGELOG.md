# DengueGuard AI — Project Changelog and Handover

Read this first if you are a new developer or AI session picking up the project. It records what has been built, where it lives, how to run it, and what is still open.

- **Project:** DengueGuard AI, a ward-level dengue early-warning prototype.
- **Event:** EDU AI Engineering Hackathon 2026, Phase 1 (24-hour remote qualifier). Challenge: *AI for Urban Dengue Outbreak*.
- **Build window:** Nov 21, 2:00 PM BST to Nov 22, 2:00 PM BST.
- **Repository:** https://github.com/ByteStudiosBD/AI-for-Urban-Dengue-Outbreak
- **Branches:**
  - `claude/happy-brown-9j46tj` is the development branch.
  - `main` already has the work up to `e1dc531` through PR #1.
- **State as of 2026-11-21:** the app is feature-complete for the brief, including all three bonus features. All automated checks passed when last run.

Related documents:
- [README.md](README.md): setup, AI disclosure, attributions.
- [ARCHITECTURE.md](ARCHITECTURE.md): the judged architecture write-up.
- [dengueguard-ai/docs/DEMO_SCRIPT.md](dengueguard-ai/docs/DEMO_SCRIPT.md): the 3-minute video walkthrough.
- [dengueguard-ai/CLAUDE_CODE_FINAL_PROMPT.md](dengueguard-ai/CLAUDE_CODE_FINAL_PROMPT.md): the original implementation brief.

---

## 1. Summary of what was built

### 1.1 Data and ML (backend)

| Area | What it does |
|---|---|
| **Ingestion** | Reads the official workbook `data/hackathon_preli_dataset.xlsx`: 31,320 rows, 60 wards in 5 city corporations, 522 weekly Mondays from 2016-01-04 to 2025-12-29. Checks the 12 expected columns and parses real or Excel-serial dates. Rejects missing values, duplicate `(ward_id, date)` rows and negative counts. Sorts by `ward_id, date` and writes `data/dataset.csv`. |
| **Rainfall-lag pipeline** | Builds features per ward with `groupby('ward_id')` + `shift`/`rolling`, so no ward borrows another's history: <br>• rainfall lags 1–4 weeks<br>• 2/3/4-week rolling rain totals and the lags 1–4 total<br>• 4-week temperature and humidity means, and lag-2 temperature and humidity<br>• recent cases (t, t−1, t−2, 4-week mean)<br>• the static ward profile (density, water-logging, sanitation, city)<br>• sin/cos of the target ISO week<br>The first 4 weeks of each ward are excluded. |
| **Models** | One model per horizon h ∈ {2, 3, 4}. The target is `dengue_cases` at t+h for the same ward. Candidates are HistGradientBoosting (squared-error), HistGradientBoosting (Poisson), a Poisson GLM, and a 4-week-mean baseline. The best one on validation MAE is kept. |
| **Chronological split** | By **target week**: train ≤ 2022, validation = 2023 (model selection and calibration), test = 2024–2025 (reported once, never tuned on). |
| **Risk tiers** | Low < 2, Medium 2–7, High 7–13, Critical ≥ 13 predicted cases per week. These are training-distribution quantiles (P70/P85/P95) and are labelled as prototype thresholds, not clinical ones. Risk score = `min(100, 100·ŷ/20)`, where 20 is P99 of training weekly cases. |
| **Prediction intervals** | 90% Mondrian split-conformal intervals on 2023 residuals, with 4 bins by predicted value. Each is labelled as a prediction interval, not a confidence interval. Lower bound ≥ 0. |
| **Explanations** | (1) Grouped permutation importance on validation. (2) A local what-if per forecast: each factor group is set to its training median, the ward is re-scored, and the change in predicted cases is reported. |
| **Inference engine** | Loads the models once and batch-scores all 93,240 (ward × week × horizon) rows at startup in about 1.5 s. Requests are table look-ups. Explanations are memoised. The engine rebuilds itself when the model file changes. |
| **API** | FastAPI with structured JSON errors, gzip, `Cache-Control` on GETs, and a dev CORS setting. It also serves the built frontend, so production runs on a single port (8000). |
| **Auth** | Demo mode needs no account. Optional local accounts are created on the command line and stored as PBKDF2-SHA256 salted hashes in the git-ignored `backend/auth_users.json`. Sessions are in memory. The UI labels this as prototype authentication. |

**Held-out test results** (target weeks 2024–2025, 6,300 ward-weeks per horizon):

| Horizon | Chosen model | MAE | RMSE | 4-week-mean baseline MAE | 90% PI coverage |
|---|---|---|---|---|---|
| 2 wk | hgb_squared_error | 1.05 | 2.04 | 1.73 | 92.4% |
| 3 wk | hgb_squared_error | 1.06 | 2.06 | 1.94 | 93.9% |
| 4 wk | hgb_poisson | 1.16 | 2.28 | 2.15 | 94.0% |

Rainfall lags rank as the most important factor group for the 2- and 3-week models.

### 1.2 Frontend

React 19 + TypeScript + Vite + Tailwind v4. The UI components are written by hand on Radix primitives in shadcn/ui style; the shadcn CLI was not used. Icons come from Lucide, charts from Recharts, animation from Motion, and routing from React Router.

| Page | Route | Features |
|---|---|---|
| Landing | `/` | Headline "Know the risk before the outbreak", CTAs **Explore Dashboard** and **View Ward Risk**. Collage of the 3 supplied hospital photos with a staggered entrance and subtle pointer parallax (disabled when reduced motion is on). Sections: lag-strip *How it works*, *Built for ward-level decisions*, *Data coverage* from real metadata, *Historical prototype* disclaimer, footer. |
| Login / demo | `/login` | **Continue in Demo Mode** (Public Health Officer (Demo)). Email and password fields with validation, a show/hide password toggle and *Remember me*. Honest errors when no accounts are configured. |
| Overview | `/dashboard` | KPIs: city cases this week vs. last week, wards at High/Critical, the selected ward's forecast with interval, and ward weather. A 26-week history chart with 2/3/4-week forecasts, interval whiskers and later actuals. Driver panel, lagged-rainfall chart, ward profile, ward watchlist. |
| Risk Predictions | `/predictions` | 2/3/4-week cards (tier, score, interval, target week, actual, evaluation status). An interval scale over the tier zones, drivers, the model's input values, data provenance, tier thresholds and the score formula. |
| Ward Risk Heatmap (Matrix) ★ | `/heatmap` | Ward × horizon and ward × last-8-reference-weeks matrices, coloured by tier with L/M/H/C text markers. Hover tooltips, click-through to predictions, sort by risk or ID, an always-visible legend and a ranking list. No geographic boundaries are drawn. |
| Weather Data | `/weather` | Weekly rainfall with toggleable t−1…t−4 lag lines, temperature (avg/max/min), humidity, a lag and rolling-totals table, a "why delayed weather matters" note, and a 12/26/52-week range selector. |
| Model Validation ★ | `/validation` | Split timeline, per-horizon test MAE/RMSE vs. baseline, interval coverage, error quantiles. Actual-vs-predicted chart with scope (all / city / ward) and date filters. Candidate model table, factor importance, error by city, caveats. |
| Not found | `*` | Friendly 404 inside the app shell. |

**Shared across pages:**
- **Navigation:** icon rail on desktop with tooltips and an animated active indicator; slide-in drawer on mobile.
- **Top bar:** city select, searchable ward picker across all 60 wards, reference-week picker limited to the data's range with previous/next arrows, and a 2/3/4-week horizon control.
- **Filters:** city, ward, week and horizon live in the URL (`?city=&ward=&asOf=&h=`), so every page and shared link keeps the same selection.
- **Alerts:** the bell shows the number of High/Critical wards, computed from real forecasts, with a popover list.
- **Export:** **Export CSV** downloads the current city forecast table.
- **Language:** EN / বাংলা toggle saved in localStorage. All UI text comes from `en.ts` / `bn.ts`. Raw ward IDs and data values are not translated.
- **States:** "Historical data" badge, skeleton loaders, error-with-retry and empty states, and a decision-support disclaimer footer.
- **Accessibility and motion:** respects `prefers-reduced-motion`, visible focus rings, ARIA labels, a skip link, and tabular numerals. Selection colour, scrollbars and the caret are themed.

★ = bonus features. The third bonus, multi-week prediction intervals, appears on Overview, Predictions and Validation.

### 1.3 Tooling and docs

- `start.sh` / `start.ps1`: one-command setup and run. `dev.sh`: hot-reload development mode.
- 30 backend pytest tests and a 14-step Playwright browser smoke test.
- `README.md`, `ARCHITECTURE.md` and `docs/DEMO_SCRIPT.md`.
- The **impeccable** design skill installed in `.claude/skills/impeccable/` (pbakaus/impeccable @ b49177d, Apache-2.0) and used for UI quality guidance.

---

## 2. Key files

Paths are relative to the repo root. Application code lives under `dengueguard-ai/`.

### Root

| File | Purpose |
|---|---|
| `README.md` | Main project README: features, results, setup, tests, API, stack, team (TODO), AI disclosure, attributions. |
| `ARCHITECTURE.md` | Data-flow diagram (Mermaid), split logic, model selection, tiers and intervals, cost controls, resilience, limitations. |
| `PROJECT_CHANGELOG.md` | This file. |
| `.claude/skills/impeccable/` | Third-party design skill for Claude Code. Not part of the app. |

### Backend (`dengueguard-ai/backend/`)

| File | Purpose |
|---|---|
| `config.py` | Paths, horizons `(2,3,4)`, split dates (`TRAIN_END=2022-12-31`, `VAL_END=2023-12-31`), 90% interval coverage, random seed. |
| `data_processing/loader.py` | `clean()`, `coverage_report()`, `build_csv()`, and the cached `load_dataset()`, which rebuilds the CSV if the XLSX is newer. CLI: `python -m backend.data_processing.loader`. |
| `rainfall_lag_pipeline/features.py` | `add_lag_features()` (as-of features per ward), `add_horizon(df, h)` (target-week season and target with an alignment guard), `FEATURES` / `FEATURE_GROUPS` (feature order and driver groups). |
| `ml_training/train.py` | Candidate models, `split_masks()`, `metrics()`, conformal `fit_intervals()` / `apply_intervals()`, grouped permutation importance. `main()` trains all horizons and writes the artifacts. CLI: `python -m backend.ml_training.train`. |
| `prediction_engine/engine.py` | `Engine.build()` batch-scores every row; `get_engine()` is the singleton that reloads when the model file changes; `tier_for()`, `eval_status()`, memoised `drivers()`. |
| `api/main.py` | All REST endpoints, error handlers, middleware and static frontend serving. |
| `api/auth.py` | Demo and local-account auth. CLI: `python -m backend.api.auth add <email>`. |

### Data and models

| File | Purpose |
|---|---|
| `data/hackathon_preli_dataset.xlsx` | Official dataset. Do not modify it. |
| `data/dataset.csv` | Generated, cleaned CSV (committed). |
| `models/trained_model.joblib` | All three horizon models plus interval calibration and training medians, 0.73 MB. |
| `models/model_metadata.json` | Split ranges, candidate scores, test metrics, baseline, error quantiles, interval bins, importance, tier thresholds and formulas. |

### Frontend (`dengueguard-ai/frontend/`)

| File / folder | Purpose |
|---|---|
| `vite.config.ts` | `@` alias, Tailwind plugin, `/api` proxy to :8000, chart and motion chunks. |
| `index.html`, `public/favicon.svg` | App shell and logo. |
| `src/index.css` | Design tokens (`--color-canvas #0b0b10`, `--color-panel #1b1b26`, `--color-accent #ff633e`, risk colours), themed browser surfaces, keyframes, reduced-motion rules. |
| `src/App.tsx`, `src/main.tsx` | Providers (motion, i18n, session, metadata, tooltip), lazy routes, page transitions. |
| `src/types/api.ts` | Typed API contract: `PredictionResult`, `ForecastInterval`, `WeatherLag`, `WardObservation`, `ValidationMetrics`, and others. |
| `src/services/api.ts` | Fetch client with an in-memory, de-duplicated GET cache and structured `ApiError`. |
| `src/state/AppData.tsx` | `MetadataProvider`, `useFilters()` (URL-synced filters), `SessionProvider`. |
| `src/i18n/{en.ts,bn.ts,index.tsx}` | Dictionaries, `t()`, locale-aware `fmtNum` / `fmtDate`, language persistence. |
| `src/lib/{utils.ts,useAsync.ts}` | `cn`, week helpers, CSV download, and an async hook that ignores stale responses. |
| `src/components/layout/` | `AppShell`, `Sidebar`, `TopBar` (filters, alerts, export, profile, `LanguageToggle`), `WardSearch`, `PageTransition`. |
| `src/components/ui/` | `Button`, `Card`, `Select`, `Tooltip`, loading / error / empty states. |
| `src/components/charts/` | `CaseForecastChart`, `LagRainChart`, `ChartTooltip`, theme. |
| `src/components/dashboard/` | `DriverPanel`, `Watchlist`. |
| `src/components/{RiskBadge,IntervalScale,Logo}.tsx` | Tier badge with colours and text markers, interval-vs-tier scale, logo. |
| `src/pages/*.tsx` | `LandingPage`, `LoginPage`, `Dashboard`, `RiskPredictions`, `WardRiskHeatmap`, `WeatherData`, `ModelValidation`, `NotFound`. |
| `src/assets/photos/` | The 3 supplied hospital photos, bundled so they work offline. |

### Scripts, tests, docs

| File | Purpose |
|---|---|
| `requirements.txt` | Pinned Python dependencies (pandas 3.0.5, scikit-learn 1.9.1, fastapi 0.165.0, …). |
| `start.sh` / `start.ps1` | Create a venv, install, retrain only if the model is missing or incompatible, `npm ci` + build, serve on :8000. |
| `dev.sh` | Uvicorn with reload on :8000 plus Vite HMR on :5173. |
| `tests/test_pipeline.py` | Schema, serial dates, duplicates, per-ward lag correctness, no cross-ward contamination, future-invariance (leakage), horizon alignment, disjoint splits, conformal properties. |
| `tests/test_api.py` | Every endpoint, interval ordering, as-of snapping, beyond-data forecasts, batch consistency, lag-vs-observation match, structured error codes, honest auth. |
| `tests/e2e_smoke.cjs` | Playwright: every route, demo login, filters, navigation that keeps filters, heatmap click-through, alerts, CSV download, language toggle, 404, zero console errors. |
| `docs/DEMO_SCRIPT.md` | Timed 3-minute voiceover walkthrough. |
| `docs/official-*.pdf`, `design/*` | The brief, rulebook, dashboard reference and photos (inputs, unchanged). |

---

## 3. Architecture, API and running

### 3.1 Data flow

```text
XLSX ──loader──▶ dataset.csv ──features (per-ward shift/rolling)──▶ feature table
   ──train (chronological split, select, conformal)──▶ models/*.joblib + metadata.json
   ──engine (load once, batch-score 93,240 rows)──▶ in-memory prediction table
   ──FastAPI /api/* (look-ups, gzip, cache headers)──▶ React UI (cached typed client)
```

At runtime there are no LLM calls, no external APIs and no database. Full details are in [ARCHITECTURE.md](ARCHITECTURE.md).

### 3.2 API endpoints (FastAPI, port 8000)

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Model loaded / degraded |
| GET | `/api/metadata` | Cities, wards, coverage, available weeks, tier and interval config, `llm_calls_per_request: 0` |
| GET | `/api/observations?city=&ward_id=&from=&to=` | Ward rows or city aggregates |
| GET | `/api/weather-lags?ward_id=&as_of=&weeks=` | Lag 1–4 rainfall, rolling totals, recent series |
| GET | `/api/predict?ward_id=&as_of=&horizon_weeks=` | One forecast with interval, tier, score, drivers, test metrics |
| GET | `/api/predict-horizons?ward_id=&as_of=` | All 3 horizons in one call |
| GET | `/api/predict-all?city=&as_of=&horizon_weeks=` | City batch, tier counts, alert count |
| GET | `/api/heatmap?city=&as_of=&weeks=` | Ward × horizon and ward × week matrices |
| GET | `/api/validation?horizon_weeks=&model=` | Split, candidates, test metrics, coverage, importance, by-city error |
| GET | `/api/validation-series?horizon_weeks=&ward_id=\|city=&from=&to=` | Actual vs predicted |
| GET | `/api/auth/config` · POST `/api/auth/demo` · POST `/api/auth/login` · GET `/api/auth/me` · POST `/api/auth/logout` | Auth |

**Error codes:** errors are returned as `{"error": {"code", "message"}}` with one of `unknown_ward`, `unknown_city`, `invalid_date`, `date_out_of_range`, `invalid_parameter`, `model_unavailable` or `not_found`.

**Date handling:** `as_of` snaps to the latest dataset week on or before the given date. The valid range is 2016-02-01 to 2025-12-29.

Interactive API docs are at http://localhost:8000/docs.

### 3.3 Setup and run

**Requirements:** Python 3.11+ and Node 20.19+ (or 22.12+) with npm.

On Windows, `python` must be a real install, not the Microsoft Store alias.

To install Python and Node with winget (Windows), run:

```powershell
winget install -e --id Python.Python.3.12
```

```powershell
winget install -e --id OpenJS.NodeJS.LTS
```

Then restart VS Code.

**Run on Windows (PowerShell):**

```powershell
cd dengueguard-ai
```

```powershell
Set-ExecutionPolicy -Scope Process Bypass
```

```powershell
.\start.ps1
```

**Run on macOS / Linux:**

```bash
cd dengueguard-ai
```

```bash
./start.sh
```

Then open **http://localhost:8000**. The first run takes about 1–2 minutes; a clean clone with warm caches took 26 s.

**Development mode:** `./dev.sh` (UI at http://localhost:5173).

**Manual commands:**

```bash
pip install -r requirements.txt
```

```bash
python -m backend.data_processing.loader
```

```bash
python -m backend.ml_training.train
```

```bash
python -m uvicorn backend.api.main:app --port 8000
```

```bash
cd frontend && npm ci && npm run build
```

**Tests:**

```bash
python -m pytest -q tests
```

```bash
cd frontend && npx tsc -b && npm run build
```

```bash
node tests/e2e_smoke.cjs
```

The browser test needs the app running and Playwright installed.

**Demo selection** (a held-out test week, so all numbers are out-of-sample): city Dhaka North, ward DNCC_Ward_05, week 2024-08-05.

### 3.4 Verification status (last run)

| Check | Result |
|---|---|
| Backend pytest | 30 passed |
| TypeScript check + production build | Passed (build about 1.7 s) |
| Playwright smoke test | 14/14 passed, no console errors |
| Clean-clone start (Linux, warm caches) | Ready in 26 s |
| Responsive check (iPhone 13 width) | No horizontal scroll |
| Bangla rendering | Checked visually |

**Windows check (2026-11-21, Windows 11, Python 3.12.10, Node 26):** `start.ps1` installs, builds and starts the engine in about 16–24 s. It was changed to check exit codes instead of using `$ErrorActionPreference = "Stop"`, because Windows PowerShell 5.1 aborted the script when uvicorn's normal stderr output was redirected. On Windows: 30/30 backend tests pass and the TypeScript check is clean. A manual browser pass found all pages loading real data with 0 console errors, heatmap click-through, alerts (11), the Export CSV control and the Bangla toggle all working, and the 404 page rendering. The Playwright smoke script itself was not run on Windows (Playwright isn't installed in the project).

---

## 4. Pending tasks, known issues, next steps

### Before submission (deadline Nov 22, 2:00 PM BST)
- [ ] **Team details in README:** team name, member names and roles (the `TODO (team)` table).
- [ ] **AI disclosure:** confirm whether ChatGPT was used and for what. Update or remove the ChatGPT row in the README.
- [ ] **Photo attributions:** add the source and licence of each `design/medical-*` photo.
- [ ] **Record the video:** at most 3:00, uncut, with voiceover, no slides, following `docs/DEMO_SCRIPT.md`. Add the link to the README.
- [ ] **Distributed commits:** each team member should commit during the window (the rulebook requires distributed history). Filling in the README TODOs is a natural first commit.
- [ ] **Merge to `main`:** merge any later commits on `claude/happy-brown-9j46tj`, including this file. PR #1 already merged everything up to `e1dc531`.
- [x] **Test on Windows:** done on 2026-11-21 (see 3.4). The teammate who commits the `start.ps1` fix should run it once more from a fresh clone.
- [ ] **Public visibility:** make sure the repository is public, and check every link in an incognito window.

### Known issues and limitations
- `medical-corridor.jpg` is only 279×279, so it looks soft on the login hero and in the collage. A higher-resolution copy would fix this.
- Only the supplied historical dataset is used: no live feed and no external epidemiological validation.
- There is no ward boundary data, so the heatmap is a matrix, not a choropleth. Do not add fabricated geography.
- Prediction intervals are per ward-week. City-level sums on the Validation chart add the bounds together, which gives a conservative envelope; the chart labels it as such.
- Forecasts beyond 2025-12-29 rely only on weather already observed; no weather forecasts are ingested.
- Auth is prototype-only: local accounts and in-memory sessions that are lost on restart.
- `start.ps1` always uses port 8000. `start.sh` accepts `PORT=…`.
- The Recharts bundle is about 480 KB (133 KB gzipped). It is lazy-loaded per page and acceptable for a local demo.

### Possible next steps (Phase 2 / onsite final)
- Ingest live or updated weekly data (the brief says a live update will arrive in Phase 2). The loader already rebuilds the cache when the source changes.
- Add weather-forecast inputs so forecasts beyond the last observed week can use predicted rain.
- Calibrate city-level intervals directly, instead of summing ward intervals.
- Add per-ward or per-city conformal bins, or quantile regression, for tighter intervals.
- Add a true choropleth if verified ward GIS boundaries are supplied.
- Persist sessions and accounts if real multi-user access is needed.
- Tag the final commit (for example `v-onsite-final`) before code freeze in Phase 2.

---

## 5. Commit history on the development branch

| Commit | Summary |
|---|---|
| `c20b090` | Team upload: brief, rulebook, dataset, design references, implementation prompt |
| `a09a839` | Add impeccable design skill |
| `7ed26b7` | Data loader and per-ward rainfall lag pipeline, with tests |
| `66fe09c` | 2/3/4-week models, chronological split, conformal intervals |
| `72d9515` | FastAPI prediction API, batch-scored engine, demo auth, API tests |
| `858fc59` | React shell, bilingual UI, Overview page |
| `fa78e8d` | Risk Predictions page |
| `97bacb3` | Ward Risk Heatmap (Matrix) |
| `a175239` | Weather Data page |
| `c7d7de2` | Model Validation page |
| `35c16f2` | Landing page with photo collage, and login |
| `f2f485d` | Start scripts and single-port serving |
| `e1dc531` | README, ARCHITECTURE, demo script, browser smoke test |
| `747c506` (main) | Merge of PR #1 into `main` |
