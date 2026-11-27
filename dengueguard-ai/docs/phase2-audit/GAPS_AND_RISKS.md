# Gaps, Weaknesses ও ঝুঁকি

শ্রেণি: **Critical** = কোনো mandatory requirement বা demo ভেঙে দিতে পারে · **High** = উল্লেখযোগ্য নম্বর হারানোর ঝুঁকি · **Medium** = গুরুত্বপূর্ণ দুর্বলতা · **Low** = ঐচ্ছিক উন্নতি।

এই audit-এ অ্যাপের কোনো কোড বদলানো হয়নি। নিচের "সমাধান" শুধু সুপারিশ।

## Critical

| # | সমস্যা | Evidence | কেন গুরুত্বপূর্ণ | সমাধান |
|---|---|---|---|---|
| C1 | **Offline demo-র পরিবেশ ঝুঁকি:** `start.ps1` প্রতিবার `pip install` ও `npm ci` চালায়; Wi-Fi বন্ধ থাকলে `npm ci` আটকে যেতে পারে। আর এই laptop-এ Smart App Control মাঝে মাঝে scikit-learn/SciPy DLL আটকায় → model load ব্যর্থ → `start.ps1` retrain করতে যায় (সেটাও আটকায়)। | `start.ps1` লাইন 30, 42; এই session-এ কয়েকবার "An Application Control policy has blocked this file" | Offline criterion = **15 নম্বর** ("zero crashes when Wi-Fi/APIs are disconnected live")। কোড ঠিক থাকলেও app চালু না হলে নম্বর যাবে। | Offline অবস্থায় সরাসরি `uvicorn` চালানো ([STRESS_TEST_MATRIX.md](STRESS_TEST_MATRIX.md)); judging-এর আগে server চালু রাখা; একবার আসল Wi-Fi বন্ধ করে মহড়া; দ্বিতীয় laptop প্রস্তুত। |
| C2 | **ভিডিও এখনও নেই, আর commit hash mismatch-এর ঝুঁকি।** | Repo-তে ভিডিও নেই; PDF: "0: … commit hash mismatch" | ১০ নম্বর পুরোটাই ঝুঁকিতে। | শেষ commit-এর পরে ভিডিও রেকর্ড; ভিডিওর পরে আর কোড commit নয় (বা আবার রেকর্ড); শুরুতে Vercel একবার খুলে রাখা (cold start ১০–১৫ সেকেন্ড)। |

## High

| # | সমস্যা | Evidence | সমাধান |
|---|---|---|---|
| H1 | **Simulator-এর প্রভাব শেখা নয়, ধরে নেওয়া** (প্রতি দলে e%)। PDF বলে "model-driven counterfactual", "multi-week ML/data impact"। | Dataset-এ intervention-এর কোনো কলাম নেই (যাচাই করা); `planner.py` লাইন 173–174 | সৎ ব্যাখ্যা ([QA_PREPARATION.md](QA_PREPARATION.md) Q21–Q25)। ঐচ্ছিক: e = 5% / 10% / 15%-এ একটা পরিসর (sensitivity) দেখানো, যাতে "এটা অনুমানের উপর নির্ভরশীল" স্পষ্ট হয়। |
| H2 | **Docs পুরনো UI বর্ণনা করে:** README ও ARCHITECTURE-এ "stock slider", "crew slider", "bed-capacity slider", "Surge (P90)"; UI এখন typed input ও "A normal week / A bad week"। | `ARCHITECTURE.md` লাইন 332, 338, 339, 342; `README.md` লাইন 38 | Judge docs আর app মিলিয়ে দেখলে অসঙ্গতি। শুধু docs আপডেট (কোড নয়)। |
| H3 | **Repo-তে কোনো git tag নেই; Phase 2-এ commit মাত্র ৩টি।** Criterion-এর শিরোনাম "Tagged Phase 1 Repo", আর "continuous commit history"। | `git tag` খালি; Phase 2: sifat252212 ×2, codertazwar ×1 | Organiser-দের জিজ্ঞেস করুন "tagged" মানে কী; প্রয়োজনে tag দিন। বাকি সময়ে ছোট ছোট অর্থবহ commit (দুই account থেকে)। |
| H4 | **Manual mode-এ মোট দলের সীমা backend মানে না।** মোট ৩ দলে ৭টি বসানো গেল; UI শুধু লাল সতর্কবার্তা দেখায়। | Run: deployment 9+2+2, total 3 → assigned 7 | Judge সংখ্যা ফুলিয়ে দেখালে simulator অবিশ্বাস্য দেখাবে। Backend-এ `sum(deployment) <= total_crews` যাচাই (422) বা clamp। |

## Medium

| # | সমস্যা | Evidence | সমাধান |
|---|---|---|---|
| M1 | **কম মজুতে সব ওয়ার্ড "critical"।** 30%-এ ৬০/৬০; "bad week"-এ ৫৯/৬০ (শয্যার কারণে)। | Run | Alert-এর স্তর ভাগ বা "সবচেয়ে জরুরি ১০টি" আলাদা করা। |
| M2 | ~~বার্তায় "Risk tier: Critical"~~ **ঠিক করা হয়েছে** (audit-এর পরে): বার্তা ও brief এখন "Very high" / "অতি উচ্চ" লেখে, আর প্রতিটি বার্তায় "What to do" / "করণীয়" ধাপ আছে; exports আবার তৈরি। বাকি: severity এখনও "WARNING/CRITICAL" (UI-তে "Short/Very short")। | `dispatch.py` `actions()`, `TIER`; test `test_actions_follow_the_plan` | চাইলে severity-র শব্দও মেলানো। |
| M3 | **Onsite workbook ও CSV দুটোই না থাকলে** প্রতি ওয়ার্ডে ১টি শয্যা ধরে নেয় → ভুয়া "শয্যাহীন রোগী"। | Run (path patch): capacity মোট ৬০, ৯১ জন শয্যাহীন | Capacity না পেলে স্পষ্ট ত্রুটি দেখানো। (দুটো ফাইলই git-এ, তাই বাস্তবে ঝুঁকি কম।) |
| M4 | **Default 100% শয্যায় সাধারণ সপ্তাহে কোনো transfer হয় না** (P90-এর সংজ্ঞা অনুযায়ী)। Judge প্রথমেই "No patients need moving" দেখতে পারেন। | Run: 171 শয্যায় transfer ০ | Demo-তে শয্যা ১৫০ টাইপ করে দেখান; Beds page এখন কারণ ব্যাখ্যা করে ও "Try it" বোতাম দেয়। |
| M5 | **"Surge (P90)" নামটা নিখুঁত নয়:** এটা দুই-দিকের 90% interval-এর upper bound — প্রায় 95th percentile। | `planner.py` লাইন 159; ARCHITECTURE লাইন 338 | Docs-এ "upper bound of the 90% prediction interval" লেখা। UI-তে এখন "A bad week"। |
| M6 | **Simulator horizon বদলালে বদলায় না**, আর এক সপ্তাহের হ্রাস পরের সপ্তাহে ছড়ায় না। | Run: h=2 ও h=4-এ prevented 39.3 | Q&A-তে ব্যাখ্যা; ঐচ্ছিক উন্নতি। |
| M7 | **Historical replay-তে planning baseline ভবিষ্যৎ ডেটা জানে:** capacity (P90) পুরো 2016–2025 থেকে, তাই 2018-এর কোনো সপ্তাহ দেখালে capacity-তে 2025-এর ডেটাও আছে। | `supplies.py` লাইন 143 | এটা model-এর leakage নয় (model-এ capacity ঢোকে না), কিন্তু জিজ্ঞেস করলে স্বীকার করুন; চাইলে "as_of-এর আগের ডেটা থেকে P90" করা যায়। |
| M8 | **"Beds 4/4 (1 routed)" বিভ্রান্তিকর হতে পারে** — ৪ জনেরই শয্যা নিশ্চিত, কিন্তু একজন অন্য ওয়ার্ডে। | SMS output | শব্দ বদলানো (যেমন "3 here + 1 moved")। |
| M9 | **Vercel cold start:** অনেকক্ষণ পর প্রথমবার ১০–১৫ সেকেন্ড "Loading…"। | Live test | ভিডিও/demo-র আগে একবার খুলে রাখা। |

## Low

| # | সমস্যা | সমাধান |
|---|---|---|
| L1 | বাংলা SMS UCS-2 হওয়ায় ~১৩৫ অক্ষর = ৩টি অংশ (খরচ বেশি)। | ছোট বাংলা template, বা বাংলা শুধু WhatsApp-এ। |
| L2 | Settings localStorage-এ থেকে যায় — পরদিন পুরনো settings দেখা যেতে পারে। | Demo-র শুরুতে Start over। |
| L3 | পুরো keyboard-only flow চালিয়ে দেখা হয়নি। | একবার Tab/Enter দিয়ে মহড়া। |
| L4 | Mosquito chart-এ পাশাপাশি bar প্রায় সমান দেখায় (~২–৩% পার্থক্য)। | শুধু "কত কম" দেখানো bar। |
| L5 | `dengueguard-ai/CLAUDE_CODE_FINAL_PROMPT.md` (ভেতরের prompt ফাইল) repo-তে আছে। | রাখবেন কিনা team ঠিক করুক; থাকলে AI disclosure-এর অংশ হিসেবে ব্যাখ্যা করতে পারবেন। |
| L6 | Phase 1 history-তে "Claude" নামে ১২টি commit। | AI disclosure-এর সাথে সামঞ্জস্যপূর্ণ — জিজ্ঞেস করলে সৎ ব্যাখ্যা। |

## Forecasting / data leakage — যা পরীক্ষা করে **সমস্যা পাওয়া যায়নি**

- Feature শুধু একই ওয়ার্ডের অতীত ডেটা থেকে (`groupby('ward_id')` + `shift`/`rolling`); test: `test_features_do_not_change_when_future_is_altered`, `test_no_cross_ward_contamination`।
- Target ঠিক h সপ্তাহ পরে, একই ওয়ার্ডে; test: `test_target_is_h_weeks_ahead_same_ward`।
- Split target তারিখ অনুযায়ী, পরস্পর বিচ্ছিন্ন; test: `test_chronological_split_is_disjoint`।
- Risk tier threshold শুধু training-এর ডেটা থেকে; interval calibration 2023 (validation) থেকে; test 2024–25 শুধু রিপোর্টের জন্য।
- Supply rate পুরো workbook থেকে fit — এটা একটা নির্দিষ্ট নিয়ম পুনরুদ্ধার (১০০% মেলে), ভবিষ্যদ্বাণীর model নয়, তাই leakage-এর প্রশ্ন নেই।

## ঝুঁকিপূর্ণ বা অসমর্থিত চিকিৎসা-দাবি এড়াতে

- "১২টি দল ৪৬ জনকে বাঁচাবে" নয় → "যদি প্রতি দল ১০% কমায়, প্রায় ৪৬ জন কম হতে পারে।"
- "হাসপাতালে ১৭১টি শয্যা আছে" নয় → "অতীতের চাহিদা থেকে অনুমান করা planning capacity।"
- Risk tier সরকারি epidemiological threshold নয়।
- এই অ্যাপ সিদ্ধান্তে সাহায্য করে; চিকিৎসা পরামর্শ বা সরকারি সতর্কবার্তা নয় (footer-এ লেখা আছে)।

## কোনটা আগে ঠিক করবেন (নম্বর ও নির্ভরযোগ্যতার প্রভাব অনুযায়ী)

1. **C1 — offline মহড়া** (কোনো কোড নয়): আসল Wi-Fi বন্ধ করে `uvicorn` দিয়ে চালিয়ে সব module একবার।
2. **C2 — ভিডিও**: শেষ commit-এর পরে, সব ৫টি module, uncut।
3. **H2 — README/ARCHITECTURE আপডেট** (শুধু docs, ঝুঁকি নেই)।
4. **H4 — backend-এ মোট দলের সীমা** (ছোট পরিবর্তন + একটি test)।
5. **H3 — tag ও commit নিয়ে organiser-দের সাথে নিশ্চিত হওয়া।**
6. **M2 — বার্তার শব্দ "Very high"-এর সাথে মেলানো ও exports আবার তৈরি।**
7. **M1 / H1 — alert-এর স্তর, simulator-এর sensitivity পরিসর** (সময় থাকলে)।
