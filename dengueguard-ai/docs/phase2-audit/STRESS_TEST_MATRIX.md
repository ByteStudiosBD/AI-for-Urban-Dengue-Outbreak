# Stress Test Matrix ও Offline Test

**Evidence-এর ধরন:** **Run** = আসল কোড চালিয়ে দেখা (Python script বা API `TestClient`); **Browser** = headless Chrome-এ local app; **Code** = শুধু কোড পড়ে যুক্তি (চালানো হয়নি)।

Scenario না বললে: 25 Aug 2025, 2 সপ্তাহ, সব এলাকা, default settings।

| # | Scenario | প্রত্যাশিত | আসল ফল | Evidence | ফল | বাস্তব প্রভাব / সমাধান |
|---|---|---|---|---|---|---|
| 1 | Stock 100% | কোনো ঘাটতি নয় | saline 1185/1185, warning/critical ০ | Run | ✅ Pass | — |
| 2 | Stock 30% | সীমিত মজুত বৈধভাবে ভাগ | available 355 = allocated 355; কেউ demand-এর বেশি না; সবাই কিছু পায় (সর্বনিম্ন ~20%); **৬০টি ওয়ার্ডই critical** | Run | ✅ Pass (বরাদ্দ) | Alert আলাদা করে কিছু বোঝায় না। সমাধান: severity-র স্তর ভাগ (যেমন fill-এর ক্রম অনুযায়ী top-N "most urgent") বা Home-এ সবচেয়ে খারাপ ওয়ার্ড আগে দেখানো |
| 3 | দল ০ | কোনো হ্রাস নয় | prevented 0, ROI `None`; উচ্চ-ঝুঁকির ওয়ার্ডে `high_risk_no_crew` পরামর্শ | Run | ✅ Pass | — |
| 4 | সর্বোচ্চ দল (৫০০) | প্রতি ওয়ার্ডে সর্বোচ্চ ৩ | assigned 180 (= ৬০ × ৩), বাকি unused; prevented 428.4, ROI 2.38 | Run | ✅ Pass | — |
| 5 | রোগী শূন্য এমন ওয়ার্ড | supply ০, ok | 25 Aug-এ নেই; শান্ত সপ্তাহে (29 Dec 2025) সব ০, "Every ward has enough…" + "No cases are expected…" ইঙ্গিত | Run + Browser | ✅ Pass | — |
| 6 | Critical-tier ওয়ার্ড | বেশি priority, দল পায় | DSCC_Ward_04 (14 রোগী) ও CCC_Ward_03 (15) — প্রতিটিতে ২টি দল; 30%-এ fill 42% → critical (উচ্চ tier-এ < 75%) | Run | ✅ Pass | — |
| 7 | সব ওয়ার্ডে demand | সবাই বরাদ্দ পায় | ৬০টির সবগুলোর demand > ০ | Run | ✅ Pass | — |
| 8 | সব ওয়ার্ডে শয্যার ঘাটতি | রিপোর্ট | শয্যা 25%: ১০৭ জন শয্যাহীন, ৬০টি critical, transfer ০ (কেউ নিতে পারে না) | Run | ✅ Pass | — |
| 9 | একটি ওয়ার্ডে খালি শয্যা | সেখানে রোগী যায় | ৪-ওয়ার্ড উদাহরণে C ও D গ্রহণ করে (ALGORITHM_WALKTHROUGHS §4.3) | Run | ✅ Pass | — |
| 10 | পুরো শহরে খালি শয্যা নেই | থামে, ঘাটতি রিপোর্ট | transfers `[]`, net deficit রিপোর্ট; UI "no other ward in the same city has a free bed" | Run + Browser | ✅ Pass | কোনো escalation সুপারিশ নেই (PDF চায়ও না) |
| 11 | একাধিক ওয়ার্ড একই খালি শয্যার জন্য | নির্দিষ্ট ক্রম | সবচেয়ে বেশি excess আগে (সমান হলে বেশি priority); receiver-এর headroom প্রতি ধাপে কমে | Run | ✅ Pass | Deterministic; কিন্তু দূরত্ব বিবেচনা নেই (ডেটায় নেই) |
| 12 | অন্য শহরে পাঠানোর চেষ্টা | অসম্ভব | গঠনগতভাবে অসম্ভব (`groupby("city")`); 60% শয্যায় cross-city ০ | Run + Code + test | ✅ Pass | — |
| 13 | শয্যা সংখ্যা সম্পাদনা | নতুন capacity মানা | override DSCC_Ward_04 = 10 → capacity 10, deficit ০; মোট ১২০ টাইপ → ঠিক ১২০ | Run + Browser | ✅ Pass | — |
| 14 | Manual দল মোট সীমার বেশি | আটকানো | প্রতি ওয়ার্ডের সর্বোচ্চ মানে (৯ → ৩); **মোট সীমা মানে না** (মোট ৩ দলে ৭টি বসল); UI লাল সতর্কবার্তা দেখায় | Run + Browser | ❌ Fail (backend) | Simulator ফল ফুলে যেতে পারে। সমাধান: backend-এ মোট সীমা যাচাই (422) বা clamp |
| 15 | কোনো intervention নয় | baseline = scenario | দল ০ বা effect ০ → prevented ০ | Run | ✅ Pass | — |
| 16 | সর্বোচ্চ effect (৫০%) | বড় হ্রাস | prevented 193.1, ROI 19.3 | Run | ✅ Pass | অবাস্তব রকম বেশি হতে পারে — assumption হিসেবে লেবেল করা আছে; API সীমা ৫০% |
| 17 | Horizon 2 → 4 | demand বদলায় | saline 1185 → 1280; simulator একই (39.3), কারণ সবসময় ২–৪ সপ্তাহ | Run | ✅ Pass | Judge "simulator কেন বদলাল না" জিজ্ঞেস করতে পারেন — উত্তর প্রস্তুত রাখুন |
| 18 | শহর বদলানো, settings রেখে | pool বদলায় | Dhaka South pool: অন্য শহরে দল ০, allocated `None`; stock/teams একই থাকে | Run + Browser | ✅ Pass | — |
| 19 | Allocation বদলের পরে dispatch | নতুন সংখ্যা | Dispatch একই params দিয়ে server-এ আবার `plan()` চালায়; SMS-এর সংখ্যা plan-এর সাথে হুবহু মেলে | Run + Code | ✅ Pass | — |
| 20 | Internet বিচ্ছিন্ন | সব চলে | Browser kill-switch: বাইরের request ০, ১৩টি page PASS, API PASS, console error ০ | Browser | ✅ Pass | OS-স্তরে Wi-Fi বন্ধ করে নয় — নিচের ম্যানুয়াল পদ্ধতিতে একবার চালান |
| 21 | Wi-Fi ছাড়া app restart | চালু হয় | **চালানো হয়নি।** `start.ps1` `npm ci` চালায় (সাধারণত internet লাগে) → আটকাতে পারে। সরাসরি `uvicorn` চালালে model ও data local, তাই চলার কথা | Code | ⚠️ Not tested | **Critical:** offline demo-তে `uvicorn` সরাসরি চালান (নিচে) |
| 22 | Invalid/negative input | স্পষ্ট ত্রুটি | stock 29/101, crews −1, effect 60, horizon 5, basis "foo", capacity 10, ঋণাত্মক override, অজানা ওয়ার্ড → 422; অজানা শহর → 404; 1990 তারিখ ও "abc" → 422; UI-তে typed input সীমার বাইরে হলে বার্তা দেখিয়ে ঠিক করে দেয় | Run + Browser | ✅ Pass | — |
| 23 | Model ফাইল নেই/নষ্ট | ক্র্যাশ নয় | `ModelUnavailable` → HTTP **503** `model_unavailable` (নষ্ট pickle-ও একই পথে) | Run (path patch) | ✅ Pass | `start.ps1` তখন retrain করার চেষ্টা করে (Smart App Control আটকালে সেটাও ব্যর্থ) |
| 24 | Onsite dataset নেই | ক্র্যাশ নয় | Workbook না থাকলেও CSV cache (`data/onsite_supplies.csv`) থেকে ঠিক চলে। **দুটোই না থাকলে** nominal rate আর প্রতি ওয়ার্ডে **১টি শয্যা** (মোট ৬০) → ৯১ জন "শয্যাহীন" — বিভ্রান্তিকর | Run (path patch) | ⚠️ Pass, দুর্বলতাসহ | দুটো ফাইলই git-এ আছে, তাই ঝুঁকি কম। সমাধান: capacity না পেলে স্পষ্ট ত্রুটি দেখানো |
| 25 | বাংলা dispatch | বাংলা লেখা ও অঙ্ক | ৬০টি বাংলা notice; "স্যালাইন ২৯/৩৩…" | Run + Browser | ✅ Pass | বাংলা SMS UCS-2 → ১৩৫ অক্ষর = ৩টি অংশ (UI-তে দেখায়) |
| 26 | Printable report | HTML/PDF | `/api/ops/brief` → 200 HTML (বাইরের URL নেই); `exports/briefs/` ৬টি ফাইল | Run | ✅ Pass (HTML) | Browser print → PDF স্বয়ংক্রিয়ভাবে test করা হয়নি |
| 27 | পুরনো/stale settings | পরিষ্কার দেখা | Settings localStorage-এ থাকে — পরদিনও আগের stock/teams থাকে; plan bar-এ সবসময় দেখায়; Start over সব রিসেট করে (Browser-এ যাচাই) | Browser | ✅ Pass, ঝুঁকিসহ | Demo-র শুরুতে Start over চাপুন |
| 28 | শুধু keyboard দিয়ে জরুরি কাজ | সব reachable | সব control আসল `<button>`, `<input>`, `<select>`, `<details>`, `<dialog>` (Esc বন্ধ করে, focus ধরে রাখে); focus ring আছে। পুরো keyboard-only flow চালিয়ে দেখা হয়নি | Code | ⚠️ Not tested | একবার Tab/Enter দিয়ে Home → Supplies → Dispatch করে দেখুন |

## PDF যা চায় না (এবং আমরা করিনি)

আসল SMS/WhatsApp পাঠানো · হাসপাতালের আসল শয্যা/মজুত তথ্য · অন্য শহরে রোগী পাঠানো বা escalation · spraying-এর প্রমাণিত causal প্রভাব · ওয়ার্ডের দূরত্ব/যাতায়াত · রোগীর ক্লিনিক্যাল অবস্থা অনুযায়ী অগ্রাধিকার। এগুলো "সমাধান করা হয়েছে" দাবি করবেন না।

---

# Offline Kill-Switch Test

## যা আমরা করেছি (browser স্তরে)

1. Local server চালু: `http://127.0.0.1:8000` (health OK)।
2. Headless Chrome চালিয়ে DevTools Protocol-এর `Fetch.enable` দিয়ে **প্রতিটি** network request থামানো হয়েছে।
3. `127.0.0.1`/`localhost`-এর request চলতে দেওয়া হয়েছে; **অন্য সব request `InternetDisconnected` দিয়ে ব্যর্থ** করানো হয়েছে ও তালিকা রাখা হয়েছে।
4. Demo sign-in; তারপর `/home`, `/allocation`, `/overflow`, `/simulator`, `/dispatch`, `/risk`, `/dashboard`, `/predictions`, `/heatmap`, `/weather`, `/validation`, `/data` — প্রতিটির লেখা যাচাই।
5. সরাসরি API: plan (৬০ ওয়ার্ড), বাংলা SMS, Dhaka South brief, ML prediction (DSCC_Ward_04, ৩ সপ্তাহ → 14.36)।

**ফল:** বাইরের request চেষ্টা **০টি**; ১৪টি check-এর সব PASS; console error ০। ব্যবহৃত local path-এর মধ্যে ছিল সব `/api/...`, JS/CSS chunk আর দুটো font ফাইল (Manrope, Noto Sans Bengali) — সবই local।

কোড-স্তরের যাচাই: backend-এ `requests`/`httpx`/`urllib`/`openai`/`anthropic` import নেই; `requirements.txt`-এ কোনো API client নেই; built `index.html`-এ সব `src`/`href` local (`/assets/...`); built JS-এ যে URL আছে সেগুলো library-র error message বা footer link — চালানোর সময় লোড হয় না।

## Production (Vercel) বনাম Local

| | Internet ছাড়া চলবে? |
|---|---|
| Vercel live site | **না** — site-টাই internet-এ। Judge Wi-Fi বন্ধ করলে live URL খুলবে না। |
| Laptop-এ local app | **হ্যাঁ** (উপরের test অনুযায়ী) — যদি server Wi-Fi বন্ধের আগে বা পরে সঠিকভাবে চালু হয় |

## Judging-এর আগে নিজে একবার করুন (আসল Wi-Fi বন্ধ করে)

1. **Internet থাকতেই** একবার `.\start.ps1` চালান (packages ও frontend build তৈরি হবে), তারপর `Ctrl + C` দিয়ে বন্ধ করুন।
2. **Wi-Fi বন্ধ করুন** (Airplane mode)।
3. `dengueguard-ai` ফোল্ডারে চালান (start.ps1 নয়):
   ```powershell
   .\.venv\Scripts\python.exe -m uvicorn backend.api.main:app --host 127.0.0.1 --port 8000
   ```
4. `Application startup complete.` দেখার পর browser-এ `http://localhost:8000` → **Demo** দিয়ে ঢুকুন।
5. Settings → **Busy season example** → Supplies, Beds (শয্যা ১৫০ টাইপ করে transfer দেখুন), Mosquito, Dispatch (বাংলা WhatsApp কপি, Printable letter খুলুন) — সব কাজ করে কিনা দেখুন।
6. ফল লিখে রাখুন। কোনো ধাপ ব্যর্থ হলে judging-এর আগে ঠিক করুন।

**এই laptop-এর বিশেষ ঝুঁকি:** Windows Smart App Control মাঝে মাঝে scikit-learn/SciPy-র DLL আটকায় (এই session-এ কয়েকবার হয়েছে)। Server চালু না হলে কয়েকবার চেষ্টা করুন; judging-এর সময় server আগে থেকে চালু রাখুন; সম্ভব হলে দ্বিতীয় একটি laptop প্রস্তুত রাখুন।
