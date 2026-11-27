# Source Code Map

Path-গুলো `dengueguard-ai/` ফোল্ডার থেকে। Line নম্বর commit `2757554`-এর। প্রতিটি algorithm-এর সূত্র ও ব্যাখ্যা [ALGORITHM_WALKTHROUGHS.md](ALGORITHM_WALKTHROUGHS.md)-এ।

## Request-এর পথ (এক নজরে)

```
Browser page  ─usePlanParams()─►  services/api.ts post()  ─HTTP─►  backend/api/main.py  ─►  planner.plan()  ─►  JSON
 (React)        state/Ops.tsx      (cache by JSON body)            PlanBody (pydantic)       supplies + engine
                                                                    _scenario() validation
```

## Backend

| Feature | File | Function / class | Lines | Input → Output | কে ডাকে | API | Tests |
|---|---|---|---|---|---|---|---|
| Data load & clean | `backend/data_processing/loader.py` | `clean`, `build_csv`, `load_dataset` | 36–56, 77–102 | Excel → validated DataFrame (`data/dataset.csv`) | engine, train | — | `test_schema_and_coverage`, `test_excel_serial_dates_parse`, `test_duplicates_rejected` |
| Rainfall lag features | `backend/rainfall_lag_pipeline/features.py` | `add_lag_features`, `add_horizon`, `feature_matrix` | 37–62, 65–78, 81–82 | per-ward rows → ২৭টি feature + target (t+h) | engine, train | `/api/weather-lags` | `test_rain_lags_match_manual_per_ward`, `test_no_cross_ward_contamination`, `test_features_do_not_change_when_future_is_altered`, `test_target_is_h_weeks_ahead_same_ward` |
| Model training (offline) | `backend/ml_training/train.py` | `candidates`, `split_masks`, `fit_intervals`, `main` | 38–50, 62–69, 78–94, 113–193 | dataset → `models/trained_model.joblib` + metadata | `python -m backend.ml_training.train` | — | `test_chronological_split_is_disjoint`, `test_conformal_interval_properties` |
| Inference engine | `backend/prediction_engine/engine.py` | `Engine.build`, `get_engine`, `tier_for` | 79–101, 119–127, 51–53 | model + data → `table[h]` (predicted, lower, upper, tier, score) | API startup, `plan()` | `/api/predict*`, `/api/heatmap`… | `test_predict_shape_and_interval`, `test_prediction_is_model_output_not_constant`, `test_forecast_beyond_data` |
| Supply rules | `backend/operations/supplies.py` | `round_half_up`, `supply_from_cases`, `fit_rate`, `SupplyModel.supplies` | 42–49, 91–103, 114–117 | cases → saline/kits/beds | `plan()`, `brief_html()` | `/api/ops/assumptions` | `test_supply_rules_reproduce_every_workbook_row`, `test_half_up_rounding_matches_dataset` |
| Bed capacity baseline | `backend/operations/supplies.py` | `get_supply_model` | 135–148 | workbook → P90 capacity per ward (মোট ১৭১) | API startup, `plan()` | `/api/ops/assumptions` (`capacity.per_ward`) | `test_capacity_baseline_is_whole_and_positive` |
| Scenario | `backend/operations/planner.py` | `Scenario` (dataclass) | 49–63 | officer settings | `_scenario()` | — | — |
| Priority | `planner.py` | inside `plan` | 153–160 | risk_score + density → 0–100 | — | — | `test_plan_scarcity_creates_deficits` |
| Stock allocation | `planner.py` | `water_fill` | 67–94; call 195–204 | demand, weight, available → integer allocation | `plan()` | `/api/ops/plan` | `test_water_fill_respects_pool_caps_and_priority`, `test_plan_scarcity_creates_deficits` |
| Crew assignment | `planner.py` | `greedy_crews`; manual branch | 97–110; 164–172 | window cases, priority, crews, e, cap → crews per ward | `plan()` | `/api/ops/plan` | `test_greedy_crews_diminishing_returns`, `test_capacity_override_and_manual_deployment` |
| Overflow routing | `planner.py` | `route_overflow`; city loop | 113–140; 206–235 | one city's wards → transfers, net deficit, occupied | `plan()` | `/api/ops/plan` (`transfers`, `cities`) | `test_routing_stays_within_city_and_conserves_patients`, `test_plan_routing_and_city_pools` |
| Flags & severity | `planner.py` | `flags`, `severity` (nested) | 237–265 | ward row → flags[], ok/warning/critical | `plan()` | — | `test_plan_scarcity_creates_deficits` |
| Simulator | `planner.py` | inside `plan` | 173–174, 267–297 | base cases × (1−e)^crews → per-horizon cases, beds, saline, ranking | `plan()` | `/api/ops/plan` (`simulation`) | `test_simulator_multi_horizon_and_roi` |
| Assumption labels | `planner.py` | `assumptions_text` | 351–366 | — → ৪টি লেবেল | `plan()`, API | `/api/ops/assumptions` | — |
| SMS / WhatsApp | `backend/operations/dispatch.py` | `sms`, `whatsapp`, `_deficits`, `_transfers_for`, `_n` | 44–68, 71–114, 22–41 | plan + ward + lang → text | `ops_dispatch`, `export.main` | `/api/ops/dispatch` | `test_dispatch_and_brief` |
| Printable brief | `dispatch.py` | `brief_html` | 129–203 | plan + city → HTML | `ops_brief`, `export.main` | `/api/ops/brief` | `test_dispatch_and_brief` |
| Exports | `backend/operations/export.py` | `main` (`SAMPLE` scenario) | 20–51 | → `exports/sms`, `exports/whatsapp`, `exports/briefs`, `plan_sample.json` | `python -m backend.operations.export` | — | — |
| API validation | `backend/api/main.py` | `PlanBody`, `DispatchBody`, `BriefBody`, `_scenario` | 400–436, 469–471 | JSON → `Scenario` বা 422/404 | FastAPI | সব `/api/ops/*` | `test_ops_validation_errors`, `test_structured_errors` |
| Ops endpoints | `main.py` | `ops_assumptions`, `ops_plan`, `ops_dispatch`, `ops_brief` | 439–480 | | | `GET /api/ops/assumptions`, `POST /api/ops/plan`, `/dispatch`, `/brief` | উপরের সব |
| Demo login | `main.py` + `backend/api/auth.py` | `auth_demo` | 493–496 | → demo session (local) | Login page | `POST /api/auth/demo` | `test_auth_is_honest` |

## Frontend (`frontend/src/`)

| অংশ | File | মূল function | কী করে |
|---|---|---|---|
| Shared plan state | `state/Ops.tsx` | `OpsProvider` (54), `useOps` (68), `usePlanParams` (84), `usePlan` (95) | settings localStorage-এ; URL filter-এর সাথে মিলিয়ে body; ২২০ ms debounce; `api.opsPlan` |
| URL filters | `state/AppData.tsx` | `useFilters` | `?city=&ward=&asOf=&h=` পড়ে/লেখে |
| API client | `services/api.ts` | `post` (58), `opsPlan` (86), `opsDispatch` (87), `opsBriefHtml` (89), `opsAssumptions` (85) | একই body-র উত্তর cache |
| Settings panel & inputs | `components/ops/simple.tsx` | `NumberField` (26), `WeekField` (173), `parseTypedDate` (119), `StockField` (264), `bagsToPct` (254), `BedsField` (327), `splitBeds` (307), `TeamsField` (319), `ExpertSettings` (368), `SettingsSheet` (405), `PlanBar` (442) | টাইপ করা সংখ্যা, সপ্তাহ, মজুত (ব্যাগ ↔ %), শয্যা (মোট ↔ %), Start over |
| Status & assumptions | `components/ops/controls.tsx` | `SeverityBadge` (23), `FillBar` (9), `AssumptionList` (56), `tFlag` (49) | Enough/Short/Very short; ৪টি assumption |
| Home | `pages/OpsHome.tsx` | `OpsHome` (47), `Todo` (26), `primaryNeed` (16) | ৪টি কাজের তালিকা, ওয়ার্ড টাইল |
| Supplies | `pages/ResourceAllocation.tsx` | `ResourceAllocation` (69), `ItemCard` (17), `WardRow` (39) | ঘাটতির বড় বাক্য, Need/Have/Short, ঘাটতির ওয়ার্ড |
| Beds | `pages/HospitalOverflow.tsx` | `HospitalOverflow` (20) | "Move these patients", "Still no bed", "Full wards", শয্যা সম্পাদনা |
| Mosquito | `pages/InterventionSimulator.tsx` | `InterventionSimulator` (16) | দল, auto/manual, "What changes", ranking |
| Dispatch | `pages/DispatchCenter.tsx` | `DispatchCenter` (115), `smsParts` (43), `WhatsAppText` (52), `openBrief` (~78), `printText` (29) | ৩ ধাপ, copy/download/print, SMS অক্ষর গণনা |
| Text (en/bn) | `i18n/en.ts`, `i18n/bn.ts` | `s.*`, `ops.*`, `ux.*` | দুই ভাষায় একই key (TypeScript দিয়ে বাধ্যতামূলক) |

## তিনটি গুরুত্বপূর্ণ কোড অংশ — সহজ ভাষায়

**1) `usePlan()` — `state/Ops.tsx`**
```ts
const params = usePlanParams()                 // URL (week, h, city) + saved settings
const debounced = useDebounced(params, 220)    // ২২০ ms স্থির না হওয়া পর্যন্ত অপেক্ষা
const q = useAsync(() => (debounced ? api.opsPlan(debounced) : null), [key])
```
টাইপ করার সময় প্রতিটি অক্ষরে server-এ request যাবে না; থামলে একবার যাবে। `useAsync` শুধু `key` (body-র JSON) বদলালে আবার চালায়।

**2) `ops_plan` — `backend/api/main.py` লাইন 447**
```python
@app.post("/api/ops/plan")
def ops_plan(body: PlanBody):
    eng = get_engine()
    return plan(eng, get_supply_model(), _scenario(eng, body))
```
`PlanBody` (pydantic) আগেই সীমা যাচাই করে (`stock_pct` ৩০–১০০ ইত্যাদি)। `_scenario()` অজানা ওয়ার্ড/শহর/ঋণাত্মক সংখ্যা আটকায়। তারপর `plan()` — যার ভেতরে কোনো network বা random কিছু নেই, তাই একই input → সবসময় একই output (deterministic)।

**3) শহরভিত্তিক routing loop — `planner.py` লাইন 216**
```python
for city, g in df.groupby("city", sort=True):
    r, tr = route_overflow(g.rename(columns={BEDS: "beds_demand"})[["ward_id", "beds_demand", "capacity", "priority"]])
```
`groupby("city")` প্রতিবার শুধু এক শহরের ওয়ার্ড দেয়, তাই `route_overflow` অন্য শহরের কোনো ওয়ার্ড দেখতেই পায় না।

## যা খুঁজে পাওয়া যায়নি / নেই

- কোনো SMS/WhatsApp পাঠানোর gateway — নেই (ইচ্ছাকৃত; শুধু তৈরি করা হয়)।
- Intervention-response model বা intervention ডেটা — নেই।
- ওয়ার্ডের মধ্যে দূরত্ব বা ভ্রমণ সময় — dataset-এ নেই, কোডেও নেই।
- Server-side PDF generator — নেই; HTML brief browser-এ print করে PDF।
