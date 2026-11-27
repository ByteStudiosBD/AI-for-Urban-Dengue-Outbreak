# Phase 2 Requirement Audit

উৎস: `Hackathon_Phase2_Problemset.pdf` (৫টি functional requirement + ১০০ নম্বরের scoring table + সর্বোচ্চ +১০ bonus, মোট ১০০-তে সীমিত)।

**Status-এর মানে:**
- ✅ **Fully implemented and verified:** কোড আছে, test আছে, আর আমরা নিজে চালিয়ে ফল দেখেছি।
- 🟡 **Implemented but partially verified:** কোড আছে ও চলে, কিন্তু কিছু অংশ যাচাই করা যায়নি।
- 🟠 **Partially implemented:** requirement-এর কিছু অংশ আছে, কিছু নেই।
- ❌ **Missing:** নেই।
- ❔ **Unverifiable:** কোড দেখে প্রমাণ করা সম্ভব নয় (যেমন ভিডিও, Q&A)।

"Marks at risk" অনুমান মাত্র — judge কীভাবে মূল্যায়ন করবেন তা আমরা নিশ্চিত জানি না। Feature থাকলেই পূর্ণ নম্বর নিশ্চিত নয়।

---

## 1. Constrained Resource Allocation Engine — 15 নম্বর

| দিক | বিবরণ |
|---|---|
| **PDF-এর হুবহু কথা** | "Convert predicted Dengue cases and risk levels into exact supply allocations (`saline_bags_needed`, `diagnostic_kits_needed`, `hospital_beds_required`) and derived vector-control crew assignments … interactive scarcity controls … Available Regional Stock (30%–100%) and Total Spraying Crews, dynamically prioritizing high-risk, high-density wards (`population_density_sqkm`) and flagging critical supply deficit warnings whenever ward demand cannot be 100% fulfilled." Scoring: "15: Accurate constrained allocation + live scarcity controls & deficit alerts. 8: Static unconstrained formulas without scarcity prioritization." |
| **প্রত্যাশিত আচরণ** | Forecast → তিনটি supply; stock ৩০–১০০% কমালে সীমিত মজুত ভাগ হবে; বেশি ঝুঁকি ও বেশি ঘনত্বের ওয়ার্ড আগে; ঘাটতি হলেই warning; crew সংখ্যা নিয়ন্ত্রণযোগ্য। |
| **আসলে যা আছে** | Supply = `floor(rate × whole_cases + 0.5)`, rate workbook থেকে fit করা (৩১,৩২০ row-এর ১০০% মেলে)। Priority = `100 × (0.7 × risk_score/100 + 0.3 × density_norm)`। Stock = demand-এর %; সীমিত হলে **water-filling** (প্রতিটি ওয়ার্ডের fill rate priority-র অনুপাতে, কেউ demand-এর বেশি পায় না, সব stock ব্যবহার হয়)। Crew: greedy, diminishing returns। প্রতিটি ঘাটতিতে flag; severity `warning`/`critical`। |
| **কোড** | `backend/operations/supplies.py` (`fit_rate`, `supply_from_cases`, `SupplyModel.supplies`); `backend/operations/planner.py` (`plan` লাইন 144–348; priority লাইন 160; `water_fill` 67–94; `greedy_crews` 97–110; flags 238–250; severity 252–265) |
| **API** | `POST /api/ops/plan` (`backend/api/main.py` লাইন 447) — `stock_pct` ৩০–১০০-এর বাইরে হলে 422 |
| **Frontend** | `/allocation` (`pages/ResourceAllocation.tsx`), settings panel (`components/ops/simple.tsx` → `StockField`, `TeamsField`) |
| **Automated tests** | `test_supply_rules_reproduce_every_workbook_row`, `test_half_up_rounding_matches_dataset`, `test_water_fill_respects_pool_caps_and_priority`, `test_greedy_crews_diminishing_returns`, `test_plan_scarcity_creates_deficits`, `test_plan_routing_and_city_pools`, `test_ops_validation_errors` |
| **আমাদের evidence** | 25 Aug 2025, stock 30%: saline দরকার 1185, পাওয়া 355, বরাদ্দ 355 (সব stock ব্যবহৃত), ৬০টি ওয়ার্ডই ঘাটতিতে; কোনো ওয়ার্ড demand-এর বেশি পায়নি; demand থাকা কোনো ওয়ার্ড ০ পায়নি। DSCC_Ward_04 (priority 79.0) পেয়েছে 14/33 (42%), NCC_Ward_02 (priority 21.5) পেয়েছে 3/14 (21%)। Browser-এ typed input দিয়ে stock বদলালে সংখ্যা সাথে সাথে বদলায়। |
| **Status** | ✅ Fully implemented and verified |
| **দুর্বলতা** | (১) stock 30%-এ ৬০টি ওয়ার্ডই "critical" হয় — alert আর আলাদা করে কিছু বোঝায় না। (২) এটা optimisation-এর heuristic (water-filling), linear programming নয় — "optimization" প্রশ্নে সেটা ব্যাখ্যা করতে হবে। (৩) Crew বণ্টনে density সরাসরি ঢোকে না (শুধু tie-break-এ priority)। (৪) README/ARCHITECTURE এখনও "slider" লেখে, UI এখন typed input। |
| **Marks at risk** | 0–2। কারণ: requirement-এর প্রতিটি অংশ আছে ও কাজ করে; ঝুঁকি শুধু ব্যাখ্যায় (alert saturation, "optimization" শব্দ)। |

## 2. Hospital Surge & Cross-Ward Overflow Routing — 10 নম্বর

| দিক | বিবরণ |
|---|---|
| **PDF-এর হুবহু কথা** | "Identify wards where projected demand exceeds local bed capacity and automatically route overflow patients to lower-burden wards within the same city …, displaying net ward deficits and city-wide bed utilization." Scoring: "Automatic intra-city patient transfer routing … displaying net deficits and remaining regional bed headroom strictly within each city pool. 10: Valid intra-city routing logic + clear deficit/headroom breakdown." |
| **আসলে যা আছে** | Capacity = প্রতিটি ওয়ার্ডের ঐতিহাসিক সাপ্তাহিক `hospital_beds_required`-এর 90th percentile, উপরে round (মোট ১৭১, editable)। প্রতিটি শহরের ভেতরে আলাদাভাবে `route_overflow`: সবচেয়ে বেশি excess-ওয়ালা ওয়ার্ড → সবচেয়ে কম load-ওয়ালা (খালি bed আছে এমন) ওয়ার্ড, যতক্ষণ excess বা headroom থাকে। বাকি excess = net deficit। প্রতি শহরে utilisation, headroom, patients routed। |
| **কোড** | `supplies.py` লাইন 143–145 (capacity); `planner.py` `route_overflow` 113–140; প্রতি শহরে loop 215–231 |
| **API / Frontend** | `POST /api/ops/plan` → `transfers`, `cities[]`, `wards[].beds`; `/overflow` (`pages/HospitalOverflow.tsx`): "Move these patients", "Still no bed" (free beds left, utilisation), "Full wards", ward-wise bed editing |
| **Tests** | `test_routing_stays_within_city_and_conserves_patients`, `test_plan_routing_and_city_pools`, `test_capacity_override_and_manual_deployment` |
| **Evidence** | 60% capacity-তে cross-city transfer: **0**। 150 bed (typed) → ৮টি transfer, সবগুলো একই শহরে, ৩ জন শয্যাহীন। পুরো শহর ভরা হলে (synthetic test): transfer `[]`, net deficit রিপোর্ট হয়। Browser-এ যাচাই করা। |
| **Status** | ✅ Fully implemented and verified |
| **দুর্বলতা** | (১) Capacity আসল হাসপাতাল তথ্য নয় — অনুমান (UI ও docs-এ লেখা আছে)। (২) Default 100% capacity-তে সাধারণ সপ্তাহে কোনো transfer হয় না (P90-এর সংজ্ঞা অনুযায়ী) — demo-তে bed কমিয়ে দেখাতে হবে। (৩) দূরত্ব/যাতায়াত dataset-এ নেই, তাই receiver বাছাই শুধু load দিয়ে। (৪) পুরো শহর ভরা হলে আলাদা "escalation" সুপারিশ নেই — শুধু net deficit দেখায়। (৫) Greedy পদ্ধতি; একই শহরে মোট আটকে থাকা রোগী সবসময় ন্যূনতম হয় (সব headroom ব্যবহৃত না হওয়া পর্যন্ত চলে), তবে কোন ওয়ার্ড কাকে পাঠাবে সেটা globally optimal নয়। |
| **Marks at risk** | 0–2 |

## 3. "What-If" Vector Control Impact Simulator — 10 নম্বর

| দিক | বিবরণ |
|---|---|
| **PDF-এর হুবহু কথা** | "Allow health officers to deploy a limited number of larvicide/fogging teams to selected wards and simulate the 2-to-4-week downstream reduction in projected cases, hospital bed load, and saline consumption, ranking wards by intervention ROI (cases prevented per crew)." Scoring: "Interactive crew deployment simulator modeling 2-to-4-week downstream ML reduction … 10: Model-driven counterfactual simulation + clear ROI ranking. 5: Basic toggle without multi-week ML/data impact." |
| **আসলে যা আছে** | তিনটি horizon-এর (2/3/4 সপ্তাহ) Phase 1 ML forecast নেওয়া হয়; n crew থাকলে cases × (1 − e)ⁿ (e = প্রতি দলের প্রভাব, default 10%, ব্যবহারকারী-নির্ধারিত)। কমা cases থেকে আবার supply rule দিয়ে bed ও saline। Auto mode: greedy (প্রান্তিক লাভ সর্বোচ্চ); manual mode: officer নিজে ওয়ার্ডে দল দেন। ROI = cases prevented / crews। |
| **কোড** | `planner.py` লাইন 164–174 (crews ও reduction), 267–297 (simulation output, ranking) |
| **Frontend** | `/simulator` (`pages/InterventionSimulator.tsx`) |
| **Tests** | `test_greedy_crews_diminishing_returns`, `test_simulator_multi_horizon_and_roi`, `test_capacity_override_and_manual_deployment` |
| **Evidence** | 25 Aug, ১২ দল, e=10%: ৪৬.৫ জন রোগী কম (2/3/4 সপ্তাহ মিলিয়ে), ROI 3.877/দল; per-horizon: 498.3→483.8, 546.4→530.1, 536.0→520.3; bed 144→139…; saline 1185→1146…। crews=0 বা effect=0 → prevented 0। |
| **Status** | 🟠 Partially implemented (requirement-এর "model-driven counterfactual"-এর তুলনায়) — simulator কাজ করে ও যাচাই করা, কিন্তু প্রভাবটা model শেখেনি |
| **দুর্বলতা** | (১) **Intervention-এর প্রভাব শেখা নয়, ধরে নেওয়া:** dataset-এ কোনো spraying/crew/fogging কলাম নেই (যাচাই করা: onsite workbook-এ মাত্র ৩টি নতুন কলাম, তিনটিই supply)। তাই e একটি scenario assumption — causal নয়। (২) ML model-কে নতুন input দিয়ে আবার চালানো (re-inference) হয় না; forecast-এর উপর গুণফল বসানো হয়। (৩) প্রভাব এক সপ্তাহ থেকে আরেক সপ্তাহে ছড়ায় না (প্রতিটি horizon আলাদাভাবে একই অনুপাতে কমে)। (৪) Manual mode-এ মোট দলের সীমা backend মানে না (UI শুধু সতর্ক করে)। |
| **Marks at risk** | 2–4। "Model-driven" শব্দটা judge কঠোরভাবে ধরলে। সৎভাবে বলতে হবে: multi-week ML forecast + স্পষ্টভাবে লেবেল করা assumption। |

## 4. Actionable Multi-Channel Dispatch Notifications (functional requirement 4)

| দিক | বিবরণ |
|---|---|
| **PDF-এর হুবহু কথা** | "Generate structured, ward-specific dispatch notices formatted for SMS/WhatsApp alerts/and printable PDF/HTML commissioner briefs, explicitly listing predicted cases, allocated vs. required supplies, deficit alerts, and assigned spraying teams." (scoring-এ আলাদা লাইন নেই; "/exports sample SMS/WhatsApp/printable briefs" criterion 5-এর অংশ) |
| **আসলে যা আছে** | `dispatch.sms()`, `dispatch.whatsapp()` (ইংরেজি ও বাংলা, বাংলা অঙ্কসহ), `dispatch.brief_html()` (print → PDF)। প্রতিটিতে predicted cases, allocated/required saline ও kits, beds (secured/required, routed), crews, deficit। একই `plan()` থেকে সংখ্যা আসে। কোনো আসল SMS/WhatsApp পাঠানো হয় না — copy/download/print। |
| **কোড / API** | `backend/operations/dispatch.py`; `POST /api/ops/dispatch`, `POST /api/ops/brief`; `backend/operations/export.py` → `exports/` |
| **Frontend** | `/dispatch` (`pages/DispatchCenter.tsx`) |
| **Tests** | `test_dispatch_and_brief` |
| **Evidence** | একই scenario-তে plan: DSCC_Ward_04 saline 29/33, kits 14/16, beds 4/4 (1 routed), crews 2; SMS: "…Saline 29/33, Kits 14/16, Beds 4/4 (1 routed). Crews 2. Deficit: saline,kits." — হুবহু মেলে। বাংলা SMS 135 অক্ষর। Brief-এ কোনো বাইরের URL নেই। |
| **Status** | ✅ Fully implemented and verified |
| **আপডেট (audit-এর পরে)** | প্রতিটি বার্তা ও brief-এ এখন plan-এর সংখ্যা থেকে তৈরি "What to do" / "করণীয়" ধাপ: কত স্যালাইন/কিট চাইতে হবে, কোন ওয়ার্ডে রোগী পাঠাতে/গ্রহণ করতে হবে, শয্যাহীন হলে সিটি অফিসে জানানো, স্প্রে দল পাঠানো, ক্লিনিককে সতর্ক করা। Tier এখন "Very high"। Test: `test_actions_follow_the_plan` (মোট ৫৫টি test পাস)। |
| **দুর্বলতা** | বার্তায় severity এখনও "WARNING/CRITICAL" (UI-তে "Short/Very short")। SMS এখন একটু লম্বা: ইংরেজি ~১৭০ অক্ষর = ২টি অংশ, বাংলা UCS-2-তে আরও বেশি অংশ। |

## 5. Offline Resilience & Deterministic Fallback — 15 নম্বর

| দিক | বিবরণ |
|---|---|
| **PDF-এর হুবহু কথা** | "Ensure all forecasting, constrained resource allocation, overflow routing, and template-based dispatch notices run locally if internet access or external LLM APIs are disconnected during live judging." Scoring: "100% local execution … with zero crashes when Wi-Fi/APIs are disconnected live. 15: Passes offline kill-switch cleanly. 8: Offline works, but weak math defense." |
| **আসলে যা আছে** | Backend-এ কোনো network library নেই (`requests`, `httpx`, `urllib`, `openai`, `anthropic` — কোনোটাই import হয় না); কোনো LLM call নেই (`/api/ops/assumptions` → `llm_calls_per_request: 0`); model `joblib` ফাইল থেকে local load; dataset `data/`-তে; fonts (Manrope, Noto Sans Bengali) build-এর ভেতরে। |
| **Evidence (local)** | Browser kill-switch test: localhost ছাড়া সব request fail করানো হয়েছে → **০টি বাইরের request হয়েছে**, ১৩টি page (৫টি operations + ৭টি analysis + demo sign-in) PASS, plan/বাংলা SMS/brief/ML prediction API PASS, console error ০। |
| **Status** | 🟡 Implemented but partially verified — local app offline চলে প্রমাণিত (browser স্তরে); OS-স্তরে Wi-Fi বন্ধ করে test করা হয়নি |
| **Production (Vercel)** | ইন্টারনেট ছাড়া Vercel site খোলা **সম্ভব নয়** — এটা স্বাভাবিক। Offline demo অবশ্যই laptop-এর local app দিয়ে করতে হবে। |
| **দুর্বলতা (Critical)** | (১) `start.ps1` প্রতিবার `pip install` ও **`npm ci`** চালায় — `npm ci` node_modules মুছে আবার install করে, যার জন্য সাধারণত ইন্টারনেট লাগে। Wi-Fi বন্ধ অবস্থায় `start.ps1` চালালে আটকে যেতে পারে। সমাধান: offline অবস্থায় সরাসরি `.\.venv\Scripts\python.exe -m uvicorn backend.api.main:app --host 127.0.0.1 --port 8000` চালানো (frontend আগে থেকেই build করা)। (২) এই laptop-এ Windows Smart App Control মাঝে মাঝে scikit-learn/SciPy DLL আটকে দেয় — model load না হলে `start.ps1` retrain করার চেষ্টা করে, সেটাও আটকে যায়। Judging-এর আগে server চালু করে রাখা বা অন্য laptop প্রস্তুত রাখা জরুরি। |
| **Marks at risk** | 0 (ভালো প্রস্তুতিতে) থেকে 8–15 (demo-র সময় app চালু না হলে)। এটাই সবচেয়ে বড় ঝুঁকি — কোডের নয়, পরিবেশের। |

## 6. Tagged Phase 1 Repo, Live URL & Dispatch Exports — 10 নম্বর

| দিক | বিবরণ |
|---|---|
| **PDF** | "Continuous commit history (follow version-onsite-final for each commit) extending the Phase 1 GitHub repository (with updated ARCHITECTURE.md and AI disclosure), a working deployed URL, and /exports sample SMS/WhatsApp/printable briefs." |
| **যা আছে** | একই Phase 1 repo (প্রথম commit 2026-11-21)। Phase 2-এ ৩টি `version-onsite-final:` commit (sifat252212 ×2, codertazwar ×1) + PR #18, #19, #20 merge। Root `ARCHITECTURE.md` §14 "Phase 2: operations" (14.1–14.6) ও §15 Limitations। README-তে AI disclosure (Claude Code, Impeccable skill, ChatGPT)। Live URL কাজ করে (health 200, নতুন UI)। `exports/`: `sms/` (৩টি), `whatsapp/` (৩টি), `briefs/` (৬টি HTML), `plan_sample.json`, `scenario.json`। |
| **Status** | 🟡 Implemented but partially verified |
| **দুর্বলতা** | (১) Repo-তে কোনো **git tag নেই** — criterion-এর শিরোনামে "Tagged" আছে; organiser কী চান নিশ্চিত হন (প্রয়োজনে `version-onsite-final` নামে tag)। (২) Phase 2-এ commit সংখ্যা কম (৩টি) — "continuous" প্রমাণে দুর্বল হতে পারে। (৩) README/ARCHITECTURE-এ "slider" ও "Surge (P90)" লেখা — নতুন UI-র সাথে মেলে না। (৪) Export ফাইলে "Risk tier: Critical" (UI-তে "Very high")। (৫) Phase 1 history-তে "Claude" নামে ১২টি commit — AI disclosure-এর সাথে সামঞ্জস্যপূর্ণ, কিন্তু জিজ্ঞেস করলে ব্যাখ্যা দিতে পারতে হবে। |
| **Marks at risk** | 1–3 |

## 7. Extended Uncut System Walkthrough Video (07:00) — 10 নম্বর

| দিক | বিবরণ |
|---|---|
| **PDF** | "Uncut screen recording with voiceover (no slides, no jump cuts)… covering all 5 modules clearly. 0: Jump cuts, slides, commit hash mismatch, or late video upload." |
| **Status** | ❔ Unverifiable — ভিডিও এখনও তৈরি হয়নি (repo-তে নেই) |
| **ঝুঁকি** | "commit hash mismatch" — ভিডিও যে commit-এর app দেখাবে, জমা দেওয়া commit-ও সেটাই হতে হবে। ভিডিও রেকর্ডের পর আর commit করলে mismatch হতে পারে। Vercel cold start (প্রথমবার ১০–১৫ সেকেন্ড "Loading…") ভিডিওতে সময় নষ্ট করতে পারে — আগে একবার খুলে রাখুন। |
| **Marks at risk** | 0–10 (সম্পূর্ণ আপনাদের রেকর্ডিং-এর উপর নির্ভর) |

## 8. Technical Q&A — 30 নম্বর

❔ Unverifiable। প্রস্তুতির জন্য [QA_PREPARATION.md](QA_PREPARATION.md) দেখুন। সবচেয়ে কঠিন প্রশ্ন আসবে: (১) intervention effect কোথা থেকে এল, (২) bed capacity আসল কিনা, (৩) এটা কি সত্যিই "optimization", (৪) 30%-এ সব critical কেন, (৫) offline কীভাবে প্রমাণ করবেন।

## 9. Bonus (সর্বোচ্চ +10, মোট ১০০-তে সীমিত)

"Genuinely useful, domain-relevant operational features beyond the core requirements." আমাদের যেগুলো core-এর বাইরে:
- দুই ভাষা (English/বাংলা) সহ বাংলা অঙ্কে SMS/WhatsApp; SMS অক্ষর ও অংশ গণনা (GSM-7 / UCS-2)।
- Calibrated 90% prediction interval দিয়ে "bad week" (surge) planning।
- Ward-wise bed capacity হাতে বদলানো; মোট bed সংখ্যা টাইপ করলে ঠিক সেই সংখ্যায় ভাগ।
- Manual crew deployment mode।
- Home to-do list, plain-language UI, typed inputs (জরুরি অবস্থায় touchpad ছাড়াই ব্যবহারযোগ্য)।
- Fitted supply rule যা workbook-এর ১০০% row মেলায় (nominal 2.39/1.17/0.30 মেলায় না — প্রমাণসহ)।
- Status: ❔ judge-এর বিবেচনা।

---

## সারসংক্ষেপ

| Criterion | নম্বর | Status | ঝুঁকি (অনুমান) |
|---|---|---|---|
| Resource allocation | 15 | ✅ | 0–2 |
| Overflow routing | 10 | ✅ | 0–2 |
| Simulator | 10 | 🟠 | 2–4 |
| Offline | 15 | 🟡 | 0 থেকে 15 (demo-র প্রস্তুতির উপর) |
| Repo/URL/docs/exports | 10 | 🟡 | 1–3 |
| Video | 10 | ❔ | — |
| Q&A | 30 | ❔ | — |
| Dispatch (functional req 4) | — | ✅ | — |

**কোড থেকে প্রমাণ করা যায় না:** ভিডিও, Q&A, judge-রা "model-driven" ও "optimization" কতটা কঠোরভাবে পড়বেন, organiser-রা "tagged" বলতে কী বোঝান, আর judging-এর দিন laptop-এর পরিবেশ (Smart App Control, Wi-Fi)।
