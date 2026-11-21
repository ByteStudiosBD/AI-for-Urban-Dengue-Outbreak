# 3-minute uncut demo script (voiceover, no slides)

Start with `./start.sh` already running and the browser at http://localhost:8000.
Use a held-out test week, so every number shown is out-of-sample: **Dhaka North · DNCC_Ward_05 · 5 Aug 2024**.

| Time | Screen | Say |
|---|---|---|
| 0:00 | Landing page | "DengueGuard AI forecasts dengue for each ward 2 to 4 weeks ahead from weekly weather. It runs locally on the official dataset: 60 wards, 2016 to 2025." Click **Explore Dashboard**. |
| 0:15 | Login (optional) | Show **Continue in Demo Mode**: "Judges never need an account." |
| 0:25 | Overview | Set city **Dhaka North**, ward **DNCC_Ward_05**, week **5 Aug 2024**. "Inputs: city, ward, reference week and horizon. The model only sees data up to this week." Point at the KPIs: observed cases, wards at High/Critical, and the selected ward's forecast with its 90% interval. |
| 0:50 | Overview chart and drivers | "Orange is observed cases. The dashed points are the 2, 3 and 4-week forecasts with prediction intervals, and the orange dots are what actually happened later." Drivers: "Rainfall lags push this forecast up the most. Below that, rain 1 to 4 weeks earlier." |
| 1:15 | Weather Data | Toggle the t−1 to t−4 lag lines. "Each lag is computed per ward with a groupby-shift, so no ward borrows another's history. Rain takes 2 to 4 weeks to become cases." |
| 1:35 | Risk Predictions | "All three horizons side by side, each with its tier, risk score, interval, and an evaluation status of held-out test." Point at the tier thresholds: "derived from the training distribution, documented, prototype only." |
| 1:55 | Heatmap | "Every ward against every horizon, coloured by model tier with text markers. No fake map, because no boundary data was supplied." Click a Critical cell to jump to its prediction. |
| 2:15 | Model Validation | "Chronological split by target week: train to 2022, validate 2023, test 2024–25. On held-out data the 2-week MAE is about 1.05 cases, 39% better than the baseline, and the 90% intervals cover about 92%." Change the scope filter. |
| 2:40 | Top bar | Click the alert bell (counted from real forecasts), **Export CSV**, and switch to **বাংলা**. "Models load once, all ward-weeks are scored in a single batch at startup, and there are no LLM or API calls, so inference is free." |
| 2:55 | — | "Decision support only, not clinical advice. Thank you." |
