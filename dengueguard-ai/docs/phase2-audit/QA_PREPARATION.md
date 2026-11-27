# Technical Q&A প্রস্তুতি (৩০ নম্বর)

প্রতিটি প্রশ্নে: **EN** = judge-কে বলার মতো ইংরেজি উত্তর · **বাংলা** = নিজে বোঝার জন্য · **Ref** = সূত্র/কোড · **Follow-up** ও তার উত্তর।

উত্তরগুলো আমাদের আসল কোড ও চালানো সংখ্যা থেকে নেওয়া। মুখস্থ না করে নিজের ভাষায় বলুন; সংখ্যা মনে না থাকলে app খুলে দেখান।

---

## A. System architecture

### Q1. Walk us through your architecture.
- **EN:** One FastAPI server serves both the API and the built React app. At startup it loads our Phase 1 models from a joblib file and scores every ward, week and horizon once. Phase 2 adds a deterministic planner: forecasts become supply demand through a rule fitted from the onsite workbook, then we prioritise wards, share limited stock, place spraying crews, route bed overflow within each city and simulate the crews' effect. Dispatch notices are generated from the same plan with templates.
- **বাংলা:** একটাই server; model একবার load, সব prediction আগে থেকে হিসাব করা; Phase 2 শুধু সেই prediction থেকে হিসাব — কোনো নতুন model বা AI call নেই।
- **Ref:** `backend/api/main.py`, `engine.py` (`Engine.build`), `planner.py` (`plan`), `dispatch.py`।
- **Follow-up:** How long does one plan take? → **উত্তর:** It's table look-ups plus vectorised NumPy on 60 wards, so it returns well under a second; the UI debounces typing by 220 ms and caches identical requests.

### Q2. Do you use an LLM or any external AI at runtime?
- **EN:** No. Zero LLM calls; the assumptions endpoint even reports `llm_calls_per_request: 0`. AI assistants were used during development only, and they're disclosed in the README.
- **বাংলা:** চালানোর সময় কোনো AI API নেই। Development-এ Claude Code ও ChatGPT ব্যবহার হয়েছে — README-তে লেখা।
- **Ref:** `GET /api/ops/assumptions`; README AI disclosure।
- **Follow-up:** Then where is the "AI"? → **উত্তর:** The forecasting model (gradient-boosted trees trained on lagged weather and cases) is the AI; Phase 2 turns its forecasts into decisions with transparent algorithms.

### Q3. How do the five pages stay consistent?
- **EN:** Every page builds its request from the same shared state — week, horizon and city from the URL, and the other settings from one store — so Supplies, Beds, Mosquito, Home and Dispatch always send the same scenario. Dispatch re-runs the same plan on the server before writing messages.
- **বাংলা:** সব page একই `usePlanParams()` ব্যবহার করে; dispatch server-এ আবার `plan()` চালায়, তাই সংখ্যা এক।
- **Ref:** `state/Ops.tsx` (`usePlanParams`, `usePlan`); `main.py` `ops_dispatch`।
- **Follow-up:** Did you check it? → **উত্তর:** Yes. For DSCC_Ward_04 at 60% stock, the plan says saline 29/33 and kits 14/16, and the SMS says exactly "Saline 29/33, Kits 14/16".

## B. Dataset

### Q4. What does the onsite dataset add?
- **EN:** It is the Phase 1 dataset row for row — same 60 wards, 522 weeks and identical case counts — plus three columns: saline bags, diagnostic kits and hospital beds required. It has no bed capacity, no stock and no spraying records.
- **বাংলা:** নতুন মাত্র ৩টি কলাম; আমরা যাচাই করেছি রোগীর সংখ্যা হুবহু এক।
- **Ref:** `supplies.py` docstring; audit script: "cases identical: True"।
- **Follow-up:** So where do capacity and stock come from? → **উত্তর:** They're labelled planning assumptions: capacity is each ward's historical P90 bed demand, and stock is a 30–100% scenario control as the brief specifies.

### Q5. The brief says about 2.39, 1.17 and 0.30 per case. Why are your rates different?
- **EN:** Those rounded values don't reproduce the data. With 0.30, a ward with 5 cases gets 1.5, which rounds to 2 beds, but the workbook says 1. We searched for rates that reproduce 100% of the 31,320 rows under half-up rounding: 2.38483, 1.16421 and 0.29843. The nominal values match only 97.8%, 93.7% and 96.2% of rows.
- **বাংলা:** Nominal rate-এ ৬৭৮ / ১,৯৮৬ / ১,১৯৭টি row মেলে না; fitted rate-এ সব মেলে।
- **Ref:** `supplies.py` `fit_rate` (লাইন 91–103); test `test_supply_rules_reproduce_every_workbook_row`।
- **Follow-up:** Why round cases first? → **উত্তর:** The workbook applies the rule to whole cases, and forecasts are fractional, so we round half-up to whole cases, then apply `floor(rate × cases + 0.5)`.

### Q6. Is your hospital capacity real?
- **EN:** No, and we say so on screen. It's a planning baseline: the 90th percentile of each ward's weekly bed demand over 2016–2025, rounded up — 171 beds in total. Officers can replace it with real numbers per ward or as a total.
- **বাংলা:** আসল তথ্য নয়; অনুমান, বদলানো যায়। API বলে `is_official_data: false`।
- **Ref:** `supplies.py` লাইন 143–145; Beds page "Change bed numbers"।
- **Follow-up:** Why P90? → **উত্তর:** A ward sized for its busy-but-normal weeks: at P90, demand exceeded capacity in about 6.5% of historical ward-weeks, which is exactly when routing matters.

## C. ML predictions

### Q7. What model do you use, and why?
- **EN:** One model per horizon. We compared Poisson gradient boosting, squared-error gradient boosting and a Poisson GLM on 2023 validation MAE. Squared-error gradient boosting won for 2 and 3 weeks, Poisson gradient boosting for 4 weeks. Test MAE is 1.05, 1.06 and 1.16 cases, against 1.73, 1.94 and 2.15 for a 4-week-average baseline.
- **বাংলা:** তিনটি model পরীক্ষা, validation-এ সেরাটা; test-এ baseline-এর চেয়ে প্রায় ৪০–৪৬% কম ভুল।
- **Ref:** `train.py` `candidates`, `main`; `models/model_metadata.json`।
- **Follow-up:** Which features matter most? → **উত্তর:** Rainfall lags: shuffling them raises 2-week validation MAE by 1.73. At 4 weeks seasonality leads at 1.18. That matches the 2–4-week breeding lag in the brief.

### Q8. How did you avoid data leakage?
- **EN:** Features use only past weeks of the same ward. The split is chronological by target week: train up to 2022, validation 2023, test 2024–25. Tier thresholds come from training data and intervals are calibrated on validation. Tests prove that changing future rows doesn't change a row's features.
- **বাংলা:** শুধু অতীত, একই ওয়ার্ড; সময় অনুযায়ী ভাগ; test দিয়ে প্রমাণিত।
- **Ref:** `features.py`; `train.py` `split_masks`; tests `test_features_do_not_change_when_future_is_altered`, `test_chronological_split_is_disjoint`।
- **Follow-up:** Is there any look-ahead anywhere? → **উত্তর:** In the model, no. One planning assumption, the P90 bed capacity, is computed from all years, so when replaying an old week it knows later data. It isn't a model input, but we'd compute it from data before the reference week in production.

### Q9. How are risk tiers defined?
- **EN:** From the training distribution of weekly cases: the 70th, 85th and 95th percentiles are 2, 7 and 13 cases. Below 2 is Low, 2–7 Medium, 7–13 High, 13 or more Critical, shown as "Very high" in the new UI. The risk score is min(100, 100 × predicted / 20), where 20 is the training P99.
- **বাংলা:** অতীত ডেটার percentile থেকে; সরকারি threshold নয়।
- **Ref:** `train.py` `TIER_QUANTILES`; `engine.py` `tier_for`।
- **Follow-up:** Why rename to "Very high"? → **উত্তর:** "Critical" was also used for supply shortages; separate words avoid confusing nurses. The messages still say "Critical", which we plan to align.

### Q10. What do your prediction intervals mean?
- **EN:** They're split-conformal 90% intervals calibrated on 2023 residuals, with separate widths for four bands of predicted value. On the untouched 2024–25 test set they covered 92.4%, 93.9% and 94.0% of actual values.
- **বাংলা:** ভবিষ্যদ্বাণীর চারপাশে ±q̂; ঐতিহাসিকভাবে ৯০%-এর বেশি ক্ষেত্রে আসল মান ভেতরে।
- **Ref:** `train.py` `fit_intervals`, `apply_intervals`।
- **Follow-up:** How are intervals used in Phase 2? → **উত্তর:** "A bad week" planning uses the upper bound instead of the point forecast. On 25 Aug 2025 that raises saline demand from 1,185 to 2,206. Strictly, it's the top of a two-sided 90% interval, so roughly the 95th percentile.

## D. Resource allocation

### Q11. How do you share stock when there isn't enough?
- **EN:** Available stock is a percentage of total demand in the pool. Each ward gets a fill rate of min(1, λ × (0.25 + priority/100)), and we solve for λ by bisection so the whole stock is used exactly. Then we convert to whole units by largest remainder. Nobody gets more than they need, and every ward with demand gets something.
- **বাংলা:** Water-filling — priority বেশি হলে শতাংশে বেশি পায়; সব মজুত ব্যবহার হয়।
- **Ref:** `planner.py` `water_fill` (লাইন 67–94); dry run [ALGORITHM_WALKTHROUGHS.md](ALGORITHM_WALKTHROUGHS.md) §3.3।
- **Follow-up:** Show me a number. → **উত্তর:** At 30% stock on 25 Aug, λ = 0.4216. DSCC_Ward_04 (priority 79) gets 14 of 33 bags, or 42%. NCC_Ward_02 (priority 21.5) gets 3 of 14, or 21%. All 355 available bags are used.

### Q12. Why weight risk 70% and density 30%?
- **EN:** It's a policy choice, not learned: risk is the model's forecast and should dominate, while density captures how fast dengue spreads in crowded wards, as the brief asks. Officers can change it under Expert settings.
- **বাংলা:** নীতিগত পছন্দ, বদলানো যায়; 0% দিলে শুধু ভিড় গোনা হয়।
- **Ref:** `planner.py` লাইন 160; `Scenario.risk_weight`।
- **Follow-up:** Does changing it matter? → **উত্তর:** Yes. At 0% the top three wards change: GCC_Ward_01 replaces CCC_Ward_03.

### Q13. Is this really optimisation? Why not linear programming?
- **EN:** Stock sharing is a closed-form fair-share rule, water-filling, not an LP: we didn't define a single objective that an LP would maximise. It guarantees full use of stock, caps at demand and gives priority-proportional fill rates, and it's instant and explainable. Crew placement is a true optimisation: greedy is provably optimal there because returns diminish.
- **বাংলা:** মজুত ভাগ = ন্যায্য-অংশের নিয়ম (LP নয়); দল বসানো = সত্যিকারের optimal।
- **Ref:** `water_fill`, `greedy_crews`।
- **Follow-up:** What would an LP give? → **উত্তর:** If you maximised weighted demand met, an LP would give everything to top-priority wards and zero to others. We deliberately avoid zeroing wards out, which is why there's a 0.25 base weight.

### Q14. Why does every ward get at least some supply?
- **EN:** The weight is 0.25 + priority/100, so even the lowest-priority ward has weight 0.25 and a non-zero fill rate. At 30% stock the lowest fill was about 20%. That's clinically safer than leaving a ward with nothing.
- **বাংলা:** `BASE_WEIGHT = 0.25` থাকায় কেউ শূন্য পায় না।
- **Ref:** `planner.py` লাইন 44, 193।
- **Follow-up:** Could a ward get more than it needs? → **উত্তর:** No. The fill rate is capped at 1, and the remainder step never exceeds demand. We checked all 60 wards at 30%.

### Q15. When is a ward "warning" versus "critical"? Why are all wards critical at 30%?
- **EN:** Any unmet demand is a warning. It becomes critical when patients have no bed after routing, when a ward gets under 50% of a supply, or when a High or Very-high-risk ward gets under 75%. At 30% stock every ward's fill is below 50%, so all 60 are critical. That's correct by the rule, but it doesn't help triage, and it's an improvement we've identified.
- **বাংলা:** নিয়মটা সঠিক, কিন্তু ৩০%-এ সবাই critical হয় — স্বীকার করুন ও উন্নতির পরিকল্পনা বলুন।
- **Ref:** `planner.py` লাইন 45–46, 252–265।
- **Follow-up:** How would you fix it? → **উত্তর:** Rank critical wards by fill rate and risk and highlight the top N, or use relative thresholds.

## E. Optimisation details

### Q16. How are spraying crews assigned?
- **EN:** One crew at a time to the ward where the next crew prevents the most cases over 2–4 weeks. The gain is cases × e × (1 − e)^(crews already there), with a cap per ward. Because gains shrink and wards are independent, this greedy choice is optimal for the assumed effect.
- **বাংলা:** প্রতিবার সবচেয়ে বেশি লাভের জায়গায়; লাভ ক্রমশ কমে বলে greedy-ই সেরা।
- **Ref:** `greedy_crews` (লাইন 97–110); dry run §5.3–5.4।
- **Follow-up:** Example? → **উত্তর:** With 12 crews on 25 Aug, crew 1 goes to CCC_Ward_03 (gain 4.41). Crew 5 goes back to CCC_Ward_03 (3.97), because that's still more than DNCC_Ward_19's first crew (3.76).

### Q17. Is stock shared across all 60 wards or per city?
- **EN:** The officer chooses. "All areas" pools all 60 wards; picking a city makes that city's demand and stock the pool, and crews go only to that city. Bed routing is always within each city, whatever the pool.
- **বাংলা:** Area setting ঠিক করে; শয্যা সবসময় শহরের ভেতরে।
- **Ref:** `planner.py` লাইন 169–171, 192।
- **Follow-up:** Verified? → **উত্তর:** Yes. In a Dhaka South pool, other cities get 0 crews and no allocation.

## F. Hospital overflow

### Q18. How do you decide a ward is overcrowded?
- **EN:** When its forecast bed demand exceeds its capacity. Excess = demand − capacity and headroom = capacity − demand, both clipped at zero.
- **বাংলা:** চাহিদা > capacity হলেই।
- **Ref:** `route_overflow` লাইন 116–117।
- **Follow-up:** Where does bed demand come from? → **উত্তর:** Forecast cases → whole cases → floor(0.29843 × cases + 0.5).

### Q19. How do you choose the receiving ward?
- **EN:** Within the city, the ward with the largest excess sends first, to the ward with the lowest current load — demand plus patients already received, divided by capacity — that still has free beds. We move as many as fit, update both wards and repeat until there's no excess or no headroom.
- **বাংলা:** সবচেয়ে বেশি চাপের ওয়ার্ড → সবচেয়ে কম চাপের ওয়ার্ড; প্রতি ধাপে হালনাগাদ।
- **Ref:** `route_overflow` লাইন 121–137; dry run §4.3।
- **Follow-up:** Why not the nearest ward? → **উত্তর:** The dataset has no locations or travel times. "Lower-burden" matches the brief's wording, and distance would be the first addition with real geography.

### Q20. What happens if every ward in a city is full?
- **EN:** Routing stops and the unmet patients are reported as the city's net deficit, with zero free beds left. We never send patients to another city, because the brief requires routing strictly within each city pool. An inter-city escalation would be a separate, human decision outside the routing.
- **বাংলা:** থামে, ঘাটতি দেখায়; অন্য শহরে পাঠায় না (PDF-এর নিয়ম)।
- **Ref:** `route_overflow` লাইন 124–125; Beds page "no other ward in the same city has a free bed"।
- **Follow-up:** Would you add escalation? → **উত্তর:** As information only — "Dhaka North is 4 beds short; Dhaka South has 2 free" — for a regional officer to decide, never as automatic routing.

### Q21. How do you prevent cross-city routing, and how is utilisation calculated?
- **EN:** The planner loops `groupby("city")` and calls the router once per city, so the router never even sees another city's wards. Utilisation = occupied beds / capacity, where occupied = min(demand, capacity) + patients received.
- **বাংলা:** গঠনগতভাবে অসম্ভব; utilisation-এর সূত্র উপরে।
- **Ref:** `planner.py` লাইন 216–231; test `test_routing_stays_within_city_and_conserves_patients`।
- **Follow-up:** Show routing in the app. → **উত্তর:** On 25 Aug 2025, type 150 beds: there are 8 moves, all within a city, and 3 patients still have no bed.

## G. Intervention simulator (সবচেয়ে কঠিন অংশ)

### Q22. Where does the 10% effect per crew come from?
- **EN:** It's a user-set scenario assumption, not an estimate. The dataset has no spraying, fogging or larvicide records, so a causal effect can't be learned from it. We expose it as an editable setting, label every output a what-if estimate, and don't cite an external number.
- **বাংলা:** ধরে নেওয়া, শেখা নয়; ডেটায় intervention নেই — এটা সৎভাবে বলুন।
- **Ref:** `planner.py` docstring লাইন 28–29; `assumptions_text` "crews"।
- **Follow-up:** Then why should we trust the output? → **উত্তর:** Trust it as a comparison tool, not a promise: it tells you where crews do the most good under a given assumption, and that ranking is driven by the ML forecasts. Officers can test 5%, 10% or 15% and see how sensitive it is.

### Q23. Is this a counterfactual or causal model?
- **EN:** It's a scenario-based counterfactual: the baseline is the ML forecast without action, and the "with crews" line applies the assumed effect. It is not a validated causal estimate, and we don't claim it is.
- **বাংলা:** "যদি এমন হয়" হিসাব; প্রমাণিত causal নয়।
- **Ref:** `simulation.label`: "…not a measured causal effect."
- **Follow-up:** How would you make it causal? → **উত্তর:** We'd collect real deployment records per ward and week and estimate the effect with a before-and-after design against matched untreated wards, then replace the assumption.

### Q24. How does the simulator use the ML model, and is it multi-week?
- **EN:** It takes the model's separate forecasts for 2, 3 and 4 weeks ahead and reduces each by (1 − e)^crews. It then re-converts the reduced cases into beds and saline with the same supply rule. It doesn't re-run the model with new inputs, and a reduction in one week doesn't carry into the next.
- **বাংলা:** তিনটি horizon-এর ML forecast, প্রতিটিতে একই অনুপাতে কমানো।
- **Ref:** `planner.py` লাইন 161–174, 267–282।
- **Follow-up:** Why doesn't changing "Next 2/3/4 weeks" change the simulator? → **উত্তর:** The simulator always reports the whole 2–4-week window. The horizon setting changes the supply and bed plan.

### Q25. How is ROI calculated and how are wards ranked?
- **EN:** ROI = cases prevented ÷ crews in that ward, over 2–4 weeks. Wards with crews are ranked by ROI. Wards without crews are ranked by what a first crew would prevent: window cases × e.
- **বাংলা:** ঠেকানো রোগী ÷ দল।
- **Ref:** `planner.py` লাইন 283–297।
- **Follow-up:** Example? → **উত্তর:** DSCC_Ward_04's window is 41.78 cases. With 2 crews it keeps 0.81, so it prevents 7.94 and the ROI is 3.97. Overall, 12 crews prevent about 46.5 cases, an ROI of 3.88.

### Q26. What if an officer manually assigns more crews than exist?
- **EN:** The per-ward cap is enforced in the backend, and the UI shows a red "too many" warning with a counter. The total isn't enforced by the backend yet — that's a known gap, and the fix is a single validation rule.
- **বাংলা:** স্বীকার করুন; ছোট fix।
- **Ref:** `planner.py` লাইন 166; audit run: 3 টি দলের সীমায় ৭টি বসেছে।
- **Follow-up:** Why not fixed? → **উত্তর:** We found it in our audit; it's first on our fix list.

## H. Dispatch

### Q27. Do you actually send SMS or WhatsApp messages?
- **EN:** No. We generate ready-to-send texts and a printable brief, and officers copy, download or print them. That keeps everything offline and avoids gateway costs. A gateway could be plugged in later.
- **বাংলা:** তৈরি করে, পাঠায় না — UI-তে স্পষ্ট লেখা।
- **Ref:** `dispatch.py`; Dispatch page note।
- **Follow-up:** What's in a notice? → **উত্তর:** Predicted cases, allocated versus required saline and kits, beds secured with any transfers, crews and the deficit list — exactly what the brief asks.

### Q28. How do you translate to Bangla?
- **EN:** We wrote separate Bangla templates, not machine translation, and convert digits to Bangla numerals.
- **বাংলা:** হাতে লেখা template + `str.maketrans`।
- **Ref:** `dispatch.py` লাইন 17–24, 51–60, 79–97।
- **Follow-up:** SMS length? → **উত্তর:** English is about 141 characters, so one SMS. Bangla uses UCS-2, so 135 characters is three parts; the UI shows the count.

### Q29. How is the printable brief made, and does it work offline?
- **EN:** The server renders an HTML page with inline CSS and no external resources, and the browser's Print → Save as PDF turns it into a PDF. City briefs count only the wards listed.
- **বাংলা:** HTML → browser-এ PDF; বাইরের কিছু নেই।
- **Ref:** `dispatch.py` `brief_html`; `/api/ops/brief`; `exports/briefs/`।
- **Follow-up:** Where are the sample exports? → **উত্তর:** The `/exports` folder has SMS, WhatsApp and briefs for all wards and each city, generated with `python -m backend.operations.export`.

## I. Offline architecture

### Q30. Prove it works offline.
- **EN:** Run it locally and turn off Wi-Fi. There's no network library in the backend, no LLM, the model and data are local files, and fonts are bundled. In our browser test we blocked every non-localhost request: zero external requests were attempted, and all 12 pages, demo login, dispatch, briefs and predictions worked.
- **বাংলা:** Local app; বাইরের request ০; সব page কাজ করেছে।
- **Ref:** [STRESS_TEST_MATRIX.md](STRESS_TEST_MATRIX.md) "Offline Kill-Switch Test"।
- **Follow-up:** And the live URL? → **উত্তর:** The Vercel site needs internet by definition. The offline guarantee is for the local laptop app, which is how judges can kill the network.

### Q31. What if the model file is missing or corrupt?
- **EN:** The server doesn't crash. Every model endpoint returns a clear 503 "model_unavailable" error with the command to retrain, and the start script retrains automatically if the model can't be loaded.
- **বাংলা:** ক্র্যাশ নয়, স্পষ্ট ত্রুটি।
- **Ref:** `engine.py` `_load_artifacts`; `main.py` exception handler।
- **Follow-up:** Missing onsite workbook? → **উত্তর:** A CSV cache is used. If both are missing it falls back to the nominal rates, but bed capacity would default to 1 per ward — a weakness we'd turn into an explicit error.

### Q32. Is anything non-deterministic?
- **EN:** No. With the same inputs you get identical output every time: no randomness at request time, no network and no LLM. Training used a fixed random seed of 42.
- **বাংলা:** একই input → একই output।
- **Ref:** `config.py` `RANDOM_STATE`; `plan()`।
- **Follow-up:** Why does that matter? → **উত্তর:** Officers and auditors can reproduce any notice exactly, and the exports match the app.

## J. Testing and limitations

### Q33. How did you test it?
- **EN:** We have 54 automated tests: data pipeline and leakage checks, API shape and errors, and Phase 2 — supply rules on every workbook row, water-fill caps and priority, greedy diminishing returns, intra-city routing, scarcity deficits, city pools, overrides, simulator horizons and ROI, dispatch and brief, and validation errors. We also browser-tested every page and ran an offline kill-switch test.
- **বাংলা:** ৫৪টি test পাস; browser ও offline test।
- **Ref:** `tests/test_pipeline.py` (13), `test_api.py` (29), `test_operations.py` (12)।
- **Follow-up:** Any test that failed in your audit? → **উত্তর:** The automated tests all pass. The audit found that the manual crew total isn't enforced and that all wards turn critical at 30% — both are documented.

### Q34. What are your biggest limitations?
- **EN:** First, bed capacity and stock are assumptions, not real inventory. Second, the crew effect is assumed, because there's no intervention data. Third, there are no distances for routing. Fourth, severity saturates at very low stock. Fifth, forecasts are about one case off on average. We label all of these in the app.
- **বাংলা:** সৎভাবে ৫টি বলুন — এটা দুর্বলতা নয়, বিশ্বাসযোগ্যতা।
- **Ref:** ARCHITECTURE §15; [GAPS_AND_RISKS.md](GAPS_AND_RISKS.md)।
- **Follow-up:** Which matters most for a real deployment? → **উত্তর:** Real bed and stock feeds, then real intervention records to replace the assumed effect.

### Q35. With more time, what would you build next?
- **EN:** Live inventory and bed-capacity inputs from hospitals, intervention logging to learn a real crew effect, travel time in routing, a sensitivity band for the simulator, alert tiers that stay informative under severe scarcity, and an optional SMS gateway.
- **বাংলা:** বাস্তব ডেটা যুক্ত করা আর assumption-গুলো প্রতিস্থাপন।
- **Ref:** —
- **Follow-up:** Why didn't you fake those data? → **উত্তর:** Presenting made-up capacity or effects as official would mislead officers. We kept assumptions editable and clearly labelled.

---

## মনে রাখার মতো সংখ্যা (25 Aug 2025, 2 সপ্তাহ)

| কী | সংখ্যা |
|---|---|
| Saline demand (normal / bad week) | 1,185 / 2,206 ব্যাগ |
| 30% মজুত | 355 ব্যাগ, λ = 0.4216, সব ৬০ ওয়ার্ড critical |
| Supply rate | 2.38483 / 1.16421 / 0.29843 (১০০% row মেলে) |
| Normal bed capacity | মোট ১৭১ |
| ১৫০ শয্যা | ৮ জন সরানো, ৩ জন শয্যাহীন |
| ১২ দল, 10% | ~৪৬.৫ জন কম, ROI 3.88/দল |
| Test MAE (2/3/4 সপ্তাহ) | 1.05 / 1.06 / 1.16 (baseline 1.73 / 1.94 / 2.15) |
| Interval coverage | 92.4% / 93.9% / 94.0% |
| Automated tests | 54 passed |
