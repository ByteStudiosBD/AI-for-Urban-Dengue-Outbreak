# Algorithm Walkthroughs — সূত্র, কোড আর আসল সংখ্যা

এখানের সব সংখ্যা আমরা **আসল কোড চালিয়ে** পেয়েছি (project-এর `.venv`, onsite workbook, `plan()` function)। Synthetic (বানানো) উদাহরণগুলোও আসল function দিয়ে চালিয়ে মিলিয়ে দেখা।

Scenario না বললে ধরে নিন: reference week **25 Aug 2025**, horizon **2 সপ্তাহ**, সব ৬০টি ওয়ার্ড এক pool-এ।

---

# PART 3 — Resource Allocation Engine

## 3.1 রোগী → supply (`backend/operations/supplies.py`)

```python
def round_half_up(x):                      # লাইন 42
    return np.floor(np.asarray(x, dtype=float) + 0.5)

def supply_from_cases(cases, rate):        # লাইন 47
    return round_half_up(rate * np.asarray(cases, dtype=float)).astype(int)

def supplies(self, cases):                 # SupplyModel, লাইন 114
    whole = round_half_up(np.clip(np.asarray(cases, dtype=float), 0, None))
    return {c: supply_from_cases(whole, r.rate) for c, r in self.rates.items()}
```

**বাংলায়:** model-এর ভগ্নাংশ রোগী (যেমন 14.01) প্রথমে পূর্ণ সংখ্যায় (14) — .5 হলে সবসময় উপরে (Python-এর `round()` .5-কে জোড় সংখ্যায় নেয়, workbook তা করে না, তাই নিজের function)। তারপর প্রতিটি supply = `floor(rate × রোগী + 0.5)`।

### Rate কোথা থেকে এল (`fit_rate`, লাইন 91–103)

Workbook-এ প্রতিটি supply রোগীর নির্দিষ্ট গুণিতক। কিন্তু brief-এর মতো 2.39 / 1.17 / 0.30 বসালে সব row মেলে না। তাই কোড একটা rate-এর পরিসর (guess × 0.8 থেকে × 1.2, ধাপ 0.0001) খুঁজে দেখে কোন rate-এ **১০০%** row মেলে, আর সেই পরিসরের মাঝখানটা নেয়।

| Supply | Fitted rate | যে পরিসরে ১০০% মেলে | Nominal rate | Nominal-এ মেলে | না-মেলা row |
|---|---|---|---|---|---|
| saline | **2.38483** | 2.38338 – 2.38628 | 2.39 | 97.84% | 678 |
| kits | **1.16421** | 1.16181 – 1.16661 | 1.17 | 93.66% | 1,986 |
| beds | **0.29843** | 0.29693 – 0.29993 | 0.30 | 96.18% | 1,197 |

উদাহরণ (আসল row): CCC_Ward_01, 2016-07-18, ৫ জন রোগী, workbook বলছে **1** শয্যা। Nominal 0.30 → 5 × 0.30 = 1.5 → half-up → **2** (ভুল)। Fitted 0.29843 → 1.492 → **1** (ঠিক)। Test: `test_supply_rules_reproduce_every_workbook_row`।

### আসল উদাহরণ — DSCC_Ward_04
Predicted 14.01 → পূর্ণ 14।
- Saline = floor(2.38483 × 14 + 0.5) = floor(33.89) = **33**
- Kits = floor(1.16421 × 14 + 0.5) = floor(16.80) = **16**
- Beds = floor(0.29843 × 14 + 0.5) = floor(4.68) = **4**

## 3.2 Priority (`planner.py` লাইন 153–160)

```python
dens_norm = (dens - dens.min()) / max(1.0, dens.max() - dens.min())
priority = 100 * (wr * main["risk_score"] / 100 + (1 - wr) * dens_norm)   # wr = risk_weight = 0.7
```

- `risk_score` = min(100, 100 × predicted / 20) — Phase 1 model থেকে।
- `density_norm` = ৬০টি ওয়ার্ডের মধ্যে জনঘনত্ব ০–১-এ (min 18,314 = DSCC_Ward_05; max 74,252 = DSCC_Ward_04)।
- ঝুঁকি ৭০%, ঘনত্ব ৩০% — Expert settings-এ বদলানো যায় ("Priority: risk vs crowding")।

| ওয়ার্ড | tier | risk_score | density | density_norm | priority = 100 × (0.7 × risk/100 + 0.3 × dn) |
|---|---|---|---|---|---|
| DSCC_Ward_04 | Critical | 70.1 | 74,252 | 1.0000 | 100 × (0.4907 + 0.3000) = **79.07** |
| DNCC_Ward_19 | High | 58.2 | 52,080 | (52,080 − 18,314) / 55,938 = 0.6036 | 100 × (0.4074 + 0.1811) = **58.85** |
| NCC_Ward_02 | Medium | 29.2 | 20,324 | 0.0359 | 100 × (0.2044 + 0.0108) = **21.52** |

(API দেখায় 79.0 / 58.8 / 21.5 — এক দশমিকে round।)

## 3.3 সীমিত মজুত ভাগ — water-filling (`water_fill`, লাইন 67–94)

```python
avail = int(np.floor(sc.stock_pct / 100 * d.sum()))      # লাইন 199: pool-এর মোট demand × stock%
weight = BASE_WEIGHT + pool["priority"] / 100              # লাইন 193: 0.25 + priority/100

def water_fill(demand, weight, available):
    if available >= total: return demand.copy()            # যথেষ্ট থাকলে সবাই পুরোটা পায়
    lo, hi = 0.0, 1.0 / weight.min()
    for _ in range(80):                                    # bisection: λ খোঁজা
        lam = (lo + hi) / 2
        if (np.minimum(1.0, lam * weight) * demand).sum() > available: hi = lam
        else: lo = lam
    real  = np.minimum(1.0, lo * weight) * demand          # ভগ্নাংশ বরাদ্দ
    alloc = np.floor(real)                                 # পূর্ণ সংখ্যা
    # বাকি ইউনিট: যার ভগ্নাংশ বেশি সে আগে (largest remainder), কখনো demand-এর বেশি নয়
```

**কী ধরনের algorithm?** এটা **linear programming নয়, greedy-ও নয়।** এটা একটা **weighted proportional (water-filling) নিয়ম**: প্রতিটি ওয়ার্ডের fill rate `fᵢ = min(1, λ × wᵢ)`, আর λ এমনভাবে বেছে নেওয়া হয় যাতে মোট বরাদ্দ = মোট মজুত। λ বের করা হয় bisection দিয়ে (৮০ বার অর্ধেক করা — খুবই নিখুঁত)। তারপর পূর্ণ সংখ্যায় আনতে largest-remainder।

**নিশ্চিত বৈশিষ্ট্য (কোড ও test দিয়ে যাচাই):**
- **সব মজুত ব্যবহার হয়:** মোট বরাদ্দ = min(available, মোট demand)। 30%-এ: available 355, allocated 355।
- **কেউ demand-এর বেশি পায় না:** `min(1, …)` আর remainder ধাপে `alloc[i] < demand[i]` শর্ত। 30%-এ যাচাই: ০টি ওয়ার্ড বেশি পেয়েছে।
- **কেউ শূন্য পায় না (demand থাকলে):** `BASE_WEIGHT = 0.25` থাকায় সবচেয়ে কম priority-র ওয়ার্ডেরও weight ≥ 0.25। 30%-এ: demand থাকা কোনো ওয়ার্ড ০ পায়নি।
- **বেশি priority = বেশি অংশ (শতাংশে):** fill rate weight-এর সমানুপাতিক (যতক্ষণ না 100% হয়)।

### Dry run ক — বানানো ৩টি ওয়ার্ড (আসল `water_fill` দিয়ে মিলিয়ে দেখা)

| | Ward A | Ward B | Ward C | মোট |
|---|---|---|---|---|
| demand (saline) | 30 | 20 | 10 | 60 |
| priority | 90 | 50 | 10 | |
| weight = 0.25 + p/100 | 1.15 | 0.75 | 0.35 | |

Stock 60% → available = floor(0.6 × 60) = **36**।
1. Bisection-এ λ = **0.67925** (যাচাই: 0.7811×30 + 0.5094×20 + 0.2377×10 = 36.0)।
2. fill = λ × w → **0.7811, 0.5094, 0.2377**।
3. real = fill × demand → 23.434, 10.189, 2.377।
4. floor → 23, 10, 2 = 35 → ১টি বাকি।
5. Largest remainder: ভগ্নাংশ .434, .189, .377 → A-র সবচেয়ে বেশি → A পায় আরেকটি।
6. **ফল: 24 / 10 / 2 = 36** ✓ (আসল function-ও `[24 10 2]` দিয়েছে)।

### Dry run খ — আসল ৩টি ওয়ার্ড, stock 30%

Pool: ৬০টি ওয়ার্ড, saline demand মোট 1,185 → available = floor(0.30 × 1,185) = **355**। পুরো pool-এর জন্য bisection-এ **λ = 0.42158**।

| ওয়ার্ড | priority | weight | fill = λ × w | demand | real | বরাদ্দ | কেন |
|---|---|---|---|---|---|---|---|
| DSCC_Ward_04 | 79.0 | 1.040 | 0.4384 | 33 | 14.47 | **14** | floor |
| DNCC_Ward_19 | 58.8 | 0.838 | 0.3533 | 29 | 10.25 | **10** | floor |
| NCC_Ward_02 | 21.5 | 0.465 | 0.1960 | 14 | 2.74 | **3** | floor 2, তারপর ভগ্নাংশ .74 বড় হওয়ায় +1 |

তিনটিই "critical": DSCC_Ward_04 উচ্চ tier-এ 42% (< 75%), বাকি দুটো < 50%।

### আপনার প্রশ্নগুলোর সরাসরি উত্তর

| প্রশ্ন | উত্তর (কোড থেকে) |
|---|---|
| কোনো ওয়ার্ড কেন আগে পায়? | Priority বেশি হলে weight বেশি → fill rate বেশি। Priority = ৭০% model risk + ৩০% জনঘনত্ব। |
| সব মজুত কি বণ্টিত হয়? | হ্যাঁ, `alloc.sum() == available` (যদি মজুত demand-এর কম হয়)। |
| কেউ কি demand-এর বেশি পেতে পারে? | না। |
| 30%-এ কি ঠিক থাকে? | হ্যাঁ — বরাদ্দ বৈধ (সবাই কিছু পায়, কেউ বেশি না, সব ব্যবহৃত)। কিন্তু **সব ৬০টি ওয়ার্ড critical** হয়ে যায় (দুর্বলতা, নিচে)। |
| ঝুঁকি ও ঘনত্বের ভারসাম্য? | `risk_weight` (default 0.7)। 0 করলে শুধু ঘনত্ব, 1 করলে শুধু ঝুঁকি। যাচাই: 0 করলে top-3 বদলায় (CCC_Ward_03-এর জায়গায় GCC_Ward_01 আসে)। |
| মজুত কি ৬০ ওয়ার্ডে, না এক শহরে? | Settings-এর "Area": All areas = ৬০ ওয়ার্ড এক pool; একটি শহর বাছলে শুধু সেই শহরের demand ও মজুত (অন্য শহরের `allocated` = `None`)। যাচাই: Dhaka South pool-এ অন্য শহরে ০টি দল, allocated None। |
| Expected বনাম "bad week"? | Expected = point forecast। "A bad week" (`demand_basis="upper"`) = 90% interval-এর **upper bound**। 25 Aug-এ saline demand 1,185 → 2,206। দ্রষ্টব্য: এটা দুই-দিকের 90% interval-এর উপরের প্রান্ত, তাই মোটামুটি **95th percentile**-এর মতো; পুরনো docs-এ লেখা "P90" নামটা ঠিক নিখুঁত নয়। |
| Crew আর supply-র সম্পর্ক? | আলাদা: মজুত ভাগ crew-কে প্রভাবিত করে না। Crew বসানো হয় ২+৩+৪ সপ্তাহের মোট forecast রোগী দিয়ে (priority শুধু সমান হলে tie-break)। শুধু "Count the spraying effect" চালু করলে supply demand crew-এর পরে কমানো রোগী দিয়ে হিসাব হয় (1,185 → 1,150)। |

## 3.4 ঘাটতি, warning ও critical (`planner.py` লাইন 238–265)

```python
# flags: saline বা kit বরাদ্দ < demand → "<supply>_deficit"; শয্যাহীন রোগী → "bed_deficit";
#        High/Critical tier অথচ ০ দল → "high_risk_no_crew" (শুধু পরামর্শ, severity-তে গোনা হয় না)
if net_deficit > 0 or worst < 0.50 or (tier in {High, Critical} and worst < 0.75): "critical"
elif কোনো ঘাটতি আছে: "warning"
else: "ok"
```

UI-তে: ok = **Enough ✓**, warning = **Short ⚠**, critical = **Very short ⛔**। PDF-এর "flagging … whenever ward demand cannot be 100% fulfilled" — যেকোনো ঘাটতিতেই flag হয় ✓।

---

# PART 4 — Hospital Overflow Routing

## 4.1 Capacity কোথা থেকে (`supplies.py` লাইন 143–145)

```python
p90 = df.groupby("ward_id")["hospital_beds_required"].quantile(0.90)
cap = {w: max(1, int(np.ceil(v - 1e-9))) for w, v in p90.items()}
```

- প্রতিটি ওয়ার্ডের ৫২২ সপ্তাহের শয্যা-চাহিদার 90th percentile, উপরে round, কমপক্ষে ১।
- ফল: ১ শয্যা ১টি ওয়ার্ড, ২ শয্যা ২২টি, ৩ শয্যা ২২টি, ৪ শয্যা ১৫টি — **মোট ১৭১**।
- **এটা আসল হাসপাতাল তথ্য নয়** — "Planning baseline capacity (editable assumption), derived from historical ward demand"। API-তে `is_official_data: false`।
- উদাহরণ: DSCC_Ward_04 → P90 = 4.0 → ৪ শয্যা; ঐতিহাসিক সর্বোচ্চ চাহিদা ৯; ৮.৪% সপ্তাহে চাহিদা ৪-এর বেশি ছিল। সব ওয়ার্ড মিলিয়ে ৬.৫% ওয়ার্ড-সপ্তাহে চাহিদা capacity ছাড়িয়েছে।

**Officer কীভাবে বদলাবেন:** (১) Settings → Hospital beds: মোট সংখ্যা টাইপ (যেমন ১৫০ — frontend `splitBeds()` ওয়ার্ডগুলোতে অনুপাতে ভাগ করে ঠিক ১৫০ বানায় ও `capacity_overrides` হিসেবে পাঠায়) বা % (`capacity_scale_pct`, প্রতি ওয়ার্ডে `round(base × %)`)। (২) Beds page → "Change bed numbers" → একেকটি ওয়ার্ডে আলাদা সংখ্যা (`capacity_overrides`)। Backend: `planner.py` লাইন 207–211।

## 4.2 Routing algorithm (`route_overflow`, লাইন 113–140)

```python
d["excess"]   = (beds_demand - capacity).clip(lower=0)   # কতজন জায়গা পাবে না
d["headroom"] = (capacity - beds_demand).clip(lower=0)   # কত শয্যা খালি
while True:
    senders, receivers = d[excess > 0], d[headroom > 0]
    if senders.empty or receivers.empty: break                       # কেউ পাঠানোর নেই, বা কেউ নেওয়ার নেই
    s = senders.sort_values(["excess", "priority"], ascending=False).index[0]   # সবচেয়ে বেশি excess
    load = (beds_demand + routed_in) / capacity                    # receiver-দের বর্তমান চাপ
    r = load.sort_values(kind="mergesort").index[0]                # সবচেয়ে কম চাপ ("lower-burden")
    k = min(excess[s], headroom[r])                                # যতজন সম্ভব
    excess[s] -= k; routed_out[s] += k; headroom[r] -= k; routed_in[r] += k
net_deficit   = excess                                             # যারা কোথাও জায়গা পেল না
beds_occupied = min(demand, capacity) + routed_in
```

এবং `plan()`-এ (লাইন 216):
```python
for city, g in df.groupby("city", sort=True):     # প্রতিটি শহর আলাদাভাবে
    r, tr = route_overflow(g ...)
```

**অন্য শহরে যাওয়া কীভাবে আটকানো:** `route_overflow` একবারে শুধু **একটি শহরের** row দেখে — অন্য শহরের ওয়ার্ড তার কাছে নেই-ই। তাই cross-city transfer গঠনগতভাবে অসম্ভব। যাচাই: 60% capacity-তে cross-city transfer ০; test `test_routing_stays_within_city_and_conserves_patients`।

**City utilisation (লাইন 221–231):** `utilisation_pct = 100 × occupied / capacity`; `headroom_after_routing = capacity − occupied`; `patients_routed`, `net_deficit`, `wards_over_capacity`।

## 4.3 Dry run — একই শহরের ৪টি ওয়ার্ড (আসল function দিয়ে চালানো)

| ওয়ার্ড | চাহিদা | capacity | excess | headroom | priority |
|---|---|---|---|---|---|
| A | 7 | 4 | **3** | 0 | 90 |
| B | 5 | 3 | **2** | 0 | 70 |
| C | 1 | 3 | 0 | **2** | 30 |
| D | 2 | 4 | 0 | **2** | 20 |

1. **ধাপ ১:** sender = A (excess 3 সবচেয়ে বেশি)। Receiver-দের load: C = 1/3 = 0.33, D = 2/4 = 0.50 → **C**। k = min(3, 2) = **2**। → A excess 1, C headroom 0।
2. **ধাপ ২:** sender-রা: A (1), B (2) → **B**। Receiver: শুধু D (C ভরা)। k = min(2, 2) = **2**। → B excess 0, D headroom 0।
3. **ধাপ ৩:** sender: A (1)। Receiver: কেউ নেই → **থামে**।

ফল (function-এর output-এর সাথে হুবহু মেলে): transfers = `[A→C: 2, B→D: 2]`; বাকি খালি শয্যা = **০**; সমাধান হয়নি = **A-তে ১ জন** (net deficit 1)।

## 4.4 আসল উদাহরণ — ১৫০ শয্যা, 25 Aug 2025, 2 সপ্তাহ

৮টি transfer, সব একই শহরে (যেমন CCC_Ward_03: চাহিদা ৪, শয্যা ৩ → ১ জন CCC_Ward_05-এ, যার চাহিদা ১, শয্যা ২); ৩ জন শয্যাহীন। ১৭১ শয্যায় ০টি transfer; ১৪০-এ ৭টি (৭ জন শয্যাহীন); ১২৮-এ ৪টি (১৬ জন)। শয্যা কম হলে গ্রহণ করার ওয়ার্ডও কমে, তাই কম রোগী সরানো যায়।

## 4.5 গুরুত্বপূর্ণ প্রশ্ন: পুরো শহর ভরা থাকলে কী হয়?

যাচাই (synthetic test: ৩টি ওয়ার্ড, চাহিদা ৫/৪/৩, প্রতিটিতে ৩ শয্যা): `transfers = []`, net deficit `[2, 1, 0]`।

**উত্তর: A — routing থেমে যায় এবং অসমাধিত ঘাটতি রিপোর্ট করে।**
- B (regional escalation সুপারিশ)? **না**, আলাদা কোনো escalation বার্তা তৈরি হয় না। UI-তে শুধু লেখা আসে: "Some wards are full, but no other ward in the same city has a free bed…"; brief-এ: "…or the city has no free beds"; city row-এ "Free beds left: 0"।
- C (অন্য শহর সুপারিশ)? **না** — এবং এটাই PDF-এর নিয়ম মানে ("within the same city", "strictly within each city pool")।

**PDF না ভেঙে ঐচ্ছিক escalation কীভাবে যোগ করা যেত (এখন নেই, শুধু ধারণা):** routing একই থাকবে। তার পরে একটা আলাদা, শুধু-তথ্যমূলক অংশ: "Dhaka North-এ ৪ জন রোগীর শয্যা নেই — বিভাগীয় স্তরে জানান। পাশের শহরে খালি শয্যা: Dhaka South ২টি"। কোনো রোগী স্বয়ংক্রিয়ভাবে অন্য শহরে পাঠানো হবে না; সিদ্ধান্ত মানুষ নেবে, আর স্পষ্ট লেবেল থাকবে "PDF-এর routing-এর বাইরে, manual escalation"।

---

# PART 5 — Mosquito-Control Simulator

## 5.1 সিস্টেমটা আসলে কী ব্যবহার করে

| বিকল্প | আমাদের সিস্টেমে? |
|---|---|
| শেখা intervention-response model | **না** — dataset-এ কোনো intervention ডেটা নেই |
| Phase 1 model-কে নতুন input দিয়ে আবার চালানো | **না** |
| Phase 1 model-এর ২/৩/৪ সপ্তাহের forecast | **হ্যাঁ** — baseline হিসেবে |
| নির্দিষ্ট শতাংশ কমানোর assumption | **হ্যাঁ** — প্রতি দলে e (default 10%) |
| Diminishing returns | **হ্যাঁ** — (1 − e)ⁿ |
| Greedy optimisation | **হ্যাঁ** — auto mode-এ দল বসানো |

## 5.2 সূত্র ও কোড

```python
e = clip(effect_per_crew_pct, 0, 90) / 100                     # লাইন 145
base[h] = forecast[h].clip(lower=0)                            # h = 2, 3, 4 (লাইন 161)
window  = base[2] + base[3] + base[4]                          # লাইন 162

# auto: greedy_crews (লাইন 97–110)
for each crew:
    gain = window * e * (1 - e) ** n        # পরের দলটা এই ওয়ার্ডে কত রোগী ঠেকাবে
    gain[n >= cap] = -1                     # ওয়ার্ডে সর্বোচ্চ দল হয়ে গেলে বাদ
    i = argmax(gain)  (সমান হলে বেশি priority)
    n[i] += 1
# manual: crews = min(deployment[w], max_crews_per_ward)       # লাইন 166

keep = (1 - e) ** crews                                         # লাইন 173
scen[h] = base[h] * keep                                        # প্রতিটি horizon আলাদাভাবে
prevented = window - (scen[2] + scen[3] + scen[4])
ROI (ward) = prevented / crews ;  ROI (total) = sum(prevented) / total crews used
bed ও saline: supply rule আবার চালানো হয় কমানো রোগীর উপর (প্রতিটি horizon-এ)
```

**`e` মানে কী:** "একটি দল তার ওয়ার্ডে যত রোগী হতো তার কত শতাংশ কমায়" — **ব্যবহারকারীর ধরে নেওয়া মান**, মাপা নয়। দ্বিতীয় দল বাকি রোগীর e% কমায় (তাই 10% → প্রথম দল 10%, দুই দল মিলে 19%, তিন দল 27.1%)।

**কেন greedy ঠিক উত্তর দেয়:** প্রতিটি ওয়ার্ডে পরের দলের লাভ ক্রমশ কমে (concave), আর ওয়ার্ডগুলো একে অপরকে প্রভাবিত করে না (separable)। এমন ক্ষেত্রে একটা একটা করে সবচেয়ে বেশি লাভের জায়গায় দল দেওয়াই মোট লাভ সর্বোচ্চ করে।

**Ranking (লাইন 297):** আগে দল পাওয়া ওয়ার্ড ROI অনুযায়ী, তারপর বাকিরা "প্রথম দল কত ঠেকাত" (`first_crew_roi = window × e`) অনুযায়ী।

**২, ৩, ৪ সপ্তাহ কি আলাদাভাবে?** আংশিক: প্রতিটি horizon-এর নিজস্ব ML forecast আছে, আর প্রতিটিতে আলাদাভাবে একই অনুপাত (keep) লাগে। কিন্তু দল বসানো হয় তিন সপ্তাহের যোগফল দেখে, আর এক সপ্তাহের কমা পরের সপ্তাহের সংক্রমণে প্রভাব ফেলে — এমন কোনো মডেল নেই। Settings-এ "Next 2/3/4 weeks" বদলালে simulator-এর ফল বদলায় না (যাচাই: h=2 ও h=4-এ prevented দুটোই 39.3), কারণ simulator সবসময় ২–৪ সপ্তাহ দেখায়।

## 5.3 Dry run ক — বানানো ৩টি ওয়ার্ড, ৪টি দল, e = 10%, প্রতি ওয়ার্ডে সর্বোচ্চ ৩

২–৪ সপ্তাহের মোট forecast: A = 40, B = 20, C = 8।

| দল | A-র লাভ | B-র লাভ | C-র লাভ | কোথায় যায় |
|---|---|---|---|---|
| ১ | 40 × 0.1 = **4.0** | 2.0 | 0.8 | A |
| ২ | 40 × 0.1 × 0.9 = **3.6** | 2.0 | 0.8 | A |
| ৩ | 40 × 0.1 × 0.81 = **3.24** | 2.0 | 0.8 | A |
| ৪ | — (A-তে ৩টি, সর্বোচ্চ) | **2.0** | 0.8 | B |

ফল `[3, 1, 0]` (function-এর output-ও তাই)। A: রাখা অংশ 0.9³ = 0.729 → ঠেকানো 40 × 0.271 = **10.84**, ROI = 10.84 / 3 = **3.61**। B: 20 × 0.1 = **2.0**, ROI **2.0**। C: ০। মোট 12.84 / 4 = 3.21/দল।

## 5.4 Dry run খ — আসল, ১২টি দল, e = 10%, সর্বোচ্চ ৩

প্রথম ১২টি greedy সিদ্ধান্ত (আসল চালানো):

| দল | ওয়ার্ড | লাভ | (২–৪ সপ্তাহের মোট forecast, আগে কয়টি দল) |
|---|---|---|---|
| 1 | CCC_Ward_03 | 4.414 | 44.14, ০ |
| 2 | DSCC_Ward_04 | 4.178 | 41.78, ০ |
| 3 | DNCC_Ward_12 | 4.136 | 41.36, ০ |
| 4 | DSCC_Ward_06 | 3.976 | 39.76, ০ |
| 5 | CCC_Ward_03 | 3.973 | 44.14, ১ |
| 6 | DNCC_Ward_19 | 3.761 | 37.61, ০ |
| 7 | DSCC_Ward_04 | 3.760 | 41.78, ১ |
| 8 | DNCC_Ward_12 | 3.723 | 41.36, ১ |
| 9 | CCC_Ward_01 | 3.718 | 37.18, ০ |
| 10 | GCC_Ward_03 | 3.691 | 36.91, ০ |
| 11 | DNCC_Ward_09 | 3.621 | 36.21, ০ |
| 12 | DSCC_Ward_06 | 3.578 | 39.76, ১ |

লক্ষ করুন: ৫ নম্বর দল CCC_Ward_03-এ দ্বিতীয়বার গেছে (3.973), কারণ তখনও সেটা DNCC_Ward_19-এর প্রথম দলের (3.761) চেয়ে বেশি।

তিনটি ওয়ার্ড বিস্তারিত:

| ওয়ার্ড | forecast h2 / h3 / h4 | মোট | দল | রাখা অংশ | ঠেকানো | ROI |
|---|---|---|---|---|---|---|
| DSCC_Ward_04 | 14.01 / 14.36 / 13.41 | 41.78 | 2 | 0.81 | 41.78 × 0.19 = **7.94** | **3.97** |
| DNCC_Ward_19 | 11.64 / 13.08 / 12.89 | 37.61 | 1 | 0.90 | **3.76** | **3.76** |
| NCC_Ward_02 | 5.83 / 6.51 / 7.07 | 19.42 | 0 | 1.00 | 0 | — (প্রথম দল ঠেকাত 1.94) |

মোট (৬০ ওয়ার্ড): **৪৬.৫ জন কম**, ROI **3.877/দল**। প্রতিটি horizon: রোগী 498.3 → 483.8, 546.4 → 530.1, 536.0 → 520.3; শয্যা 144 → 139, 164 → 160, 158 → 153; স্যালাইন 1185 → 1146, 1300 → 1265, 1280 → 1243।

## 5.5 PDF-এর সাথে কতটা মেলে

| PDF চায় | আমাদের | মন্তব্য |
|---|---|---|
| সীমিত সংখ্যক দল নির্বাচিত ওয়ার্ডে | ✅ মোট দল + auto/manual | Manual-এ মোট সীমা backend মানে না |
| ২–৪ সপ্তাহের হ্রাস: রোগী, শয্যা, স্যালাইন | ✅ তিনটিই, প্রতি horizon | |
| ROI (cases prevented per crew) দিয়ে ranking | ✅ | |
| "Model-driven counterfactual", "multi-week ML/data impact" | 🟠 আংশিক | Baseline ML থেকে, কিন্তু প্রভাব ধরে নেওয়া — ডেটায় intervention নেই |

**Judge-কে সৎ উত্তর:** "The 2-to-4-week baselines are our ML forecasts. The intervention effect is a transparent, editable assumption, because the dataset contains no spraying records — so we cannot learn a causal effect, and we label every output as a what-if estimate. The optimisation of where to send crews is exact for that assumption."

---

# PART 6 — Dispatch Center

## 6.1 Request থেকে বার্তা পর্যন্ত

1. Dispatch page `usePlanParams()` (Supplies/Beds/Mosquito-এর মতো একই scenario) + `lang` + `only_flagged` → `POST /api/ops/dispatch` (`main.py` লাইন 453–466)।
2. Server **নতুন করে** `plan()` চালায় একই params দিয়ে → একই সংখ্যা।
3. প্রতিটি ওয়ার্ডের জন্য `dispatch.sms(p, w, lang)` ও `dispatch.whatsapp(p, w, lang)`।
4. Brief: `POST /api/ops/brief` (`brief_city` = কোন শহরের তালিকা; মজুতের pool বদলায় না) → `dispatch.brief_html()` → HTML; browser-এ Print → Save as PDF।

## 6.2 Template (`backend/operations/dispatch.py`)

```python
def sms(plan, w, lang="en"):                     # লাইন 44
    secured = b["required"] - b["net_deficit"]   # নিজের বা অন্য ওয়ার্ডে যাদের শয্যা নিশ্চিত
    d = _deficits(w)                             # saline/kits বরাদ্দ < demand, বা শয্যাহীন রোগী
    "DENGUEGUARD {ward} wk {target}: {SEVERITY}. Pred {cases} cases. "
    "Saline {alloc}/{req}, Kits {alloc}/{req}, Beds {secured}/{req} ({routed} routed). Crews {n}. Deficit: …"
```

- **অনুবাদ:** আলাদা বাংলা template (machine translation নয়) + `str.maketrans` দিয়ে ০–৯ বাংলা অঙ্কে (`_n()`)।
- **WhatsApp** (লাইন 71): `*bold*` শিরোনাম, interval, প্রতিটি transfer ("→ route 1 patient(s) to DSCC_Ward_07" / "← receive …"), crews, "⚠️ Deficit", আর শেষে "Planning scenario … not official data"।
- **Brief** (লাইন 129): সারাংশ, প্রতিটি ওয়ার্ডের টেবিল (priority অনুযায়ী), শহরভিত্তিক শয্যা (routed, deficit, headroom, utilisation), transfers, ২–৪ সপ্তাহের simulator, assumptions। শুধু তালিকাভুক্ত ওয়ার্ডের সংখ্যা গোনা হয়। সব লেখা `html.escape` দিয়ে নিরাপদ।
- **আসল পাঠানো হয় না:** কোনো SMS gateway/WhatsApp API নেই। Copy, Download (.txt), Print।

## 6.3 সংখ্যা কি সব page-এ মেলে? (যাচাই)

একই scenario (stock 60%, ১২ দল, শয্যা 75%), DSCC_Ward_04:
- `plan()`: রোগী 14, saline 29/33, kits 14/16, শয্যা 4 (১ জন routed), দল 2, severity warning।
- SMS (en): "DENGUEGUARD DSCC_Ward_04 wk 2025-09-08: WARNING. Pred 14 cases. Saline 29/33, Kits 14/16, Beds 4/4 (1 routed). Crews 2. Deficit: saline,kits." (১৪১ অক্ষর = ১টি SMS)
- SMS (bn): "ডেঙ্গুগার্ড DSCC_Ward_04 ২০২৫-০৯-০৮: সতর্কতা। পূর্বাভাস ১৪ রোগী। স্যালাইন ২৯/৩৩, কিট ১৪/১৬, বেড ৪/৪। স্প্রে দল ২। ঘাটতি: স্যালাইন, কিট।" (১৩৫ অক্ষর, UCS-2 → ৩টি অংশ)

**সংখ্যা হুবহু মেলে।** (উপরের SMS audit-এর সময়ের; এখন শেষে "Do: order 4 saline+2 kits; send 1 pt to DSCC_Ward_07; spray 2 teams." যুক্ত হয়।)

### 6.4 "What to do" ধাপ (audit-এর পরে যোগ করা — `dispatch.actions()`)

প্রতিটি ধাপ plan-এর একটি সংখ্যা থেকে আসে, কোনো AI বা চিকিৎসা-পরামর্শ নয়:

| শর্ত (plan থেকে) | ধাপ |
|---|---|
| saline বা kit বরাদ্দ < demand | "Request {demand − বরাদ্দ} more saline bags and … test kits from the city store." |
| এই ওয়ার্ড থেকে transfer | "Send {n} patient(s) to {ward} (same city); call ahead to confirm the bed." |
| এই ওয়ার্ডে transfer আসছে | "Keep {n} bed(s) ready for patients from {ward}." |
| net deficit > 0 | "{n} patient(s) have no free bed anywhere in this city: report to the city health office today." |
| দল > 0 | "Deploy {n} spraying team(s) this week: clear standing water in drains, containers and building sites." |
| উচ্চ ঝুঁকি, দল ০ | "High risk but no spraying team: request one, or organise a community clean-up of standing water." |
| রোগী > 0 | "Tell local clinics to expect about {n} dengue cases in the week of {date}." |
| কিছুই নেই | "No shortage this week: continue routine monitoring." |

WhatsApp-এ "*What to do*" (বাংলায় "*করণীয়*") নম্বরসহ তালিকা; SMS-এ ছোট "Do: …"; brief-এ "What each ward should do"। Test `test_actions_follow_the_plan` ৬০টি ওয়ার্ডেই যাচাই করে যে ধাপগুলো plan-এর সংখ্যার সাথে মেলে।

শব্দের পার্থক্য যা বাকি আছে:
1. ~~বার্তায় "Risk tier: Critical"~~ — ঠিক করা হয়েছে, এখন "Very high" / "অতি উচ্চ"।
2. বার্তায় severity "WARNING/CRITICAL", UI-তে "Short / Very short"।
3. "Beds 4/4 (1 routed)" — ৪ জনেরই শয্যা নিশ্চিত, তবে একজন অন্য ওয়ার্ডে; শুধু "4/4" পড়লে ভুল বোঝা যেতে পারে।
