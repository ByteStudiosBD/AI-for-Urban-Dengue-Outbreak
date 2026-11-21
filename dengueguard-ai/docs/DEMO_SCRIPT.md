# Demo script: live walkthrough (voiceover, no slides)

The rulebook asks for a 2-minute video and the challenge brief allows up to 3:00. The **core** steps below run about **1:55**. The steps marked *(optional)* add about a minute; include them only if you stay under 3:00.

## Before you press record

1. Start the app: `.\start.ps1` (Windows) or `./start.sh` (macOS / Linux). Wait for `DengueGuard AI running at http://localhost:8000`.
2. Open http://localhost:8000 in a browser at 100% zoom, full screen, with other tabs closed.
3. Do one dry run first, so every page is already cached and loads instantly.
4. Record **one continuous take** with your microphone on. No cuts, no slides, no music over the voice.
5. Demo selection (a held-out test week, so every number is out-of-sample): reference week **5 Aug 2024**, ward **DNCC_Ward_19** (Critical at 2 weeks).

## Script

| Time | Screen and action | Say |
|---|---|---|
| 0:00 | The site opens on the **sign-in page**. Click **Continue in Demo Mode**; you land on the **homepage**. Click **Explore Dashboard** to open **Risk Overview**. | "DengueGuard AI forecasts dengue for every ward two to four weeks ahead from weekly weather, using the official dataset: sixty wards, 2016 to 2025." |
| 0:12 | Risk Overview. In the left panel set the reference week to **5 Aug 2024** and horizon **2 wk**. | "Each tile is one dataset ward, grouped by city. This is a schematic view, not a map, because no verified ward boundaries exist. The colours come from live model inference for the week and horizon I pick." |
| 0:28 | Point at the legend, then the striped **DNCC_Ward_19** tile. Switch the horizon to **4 wk**, then back to **2 wk**. | "Green is low, blue medium, red high or critical. Critical wards are also striped with a C. Changing the horizon re-reads the model's forecasts, so the picture shifts as the outbreak builds." |
| 0:45 | Click **DNCC_Ward_19**. Panel opens on **Overview**. | "Clicking a ward opens its details: the exact four-tier forecast, Critical here, 13.3 cases with a 90% prediction interval, its risk score, and what was actually observed later: 19 cases." |
| 1:00 | Panel tab **Weather & drivers**. | "The drivers show why. Lagged rainfall and humidity push this forecast up most. Rainfall lags of one to four weeks are computed separately for each ward, because rain takes weeks to become cases. Waterlogging, sanitation and density are here too." |
| 1:18 | Panel tab **Trends**. | "Fifty-two weeks of observed cases and weather, then the two-, three- and four-week forecasts with their intervals." |
| 1:28 | Panel tab **All ward data**, then click **Open in View Data**. | "Every original record for this ward is available. View Data shows the full dataset: thirty-one thousand rows, all original columns, unchanged, with sorting, filters and CSV download." |
| 1:42 | Left sidebar: **Model Validation**. | "We validate chronologically: train to 2022, tune on 2023, test on 2024 and 2025. On unseen data the two-week error is about one case per ward-week, thirty-nine percent better than the baseline." |
| 1:52 | Stop here for a 2-minute video. | "Models load once and need no API calls, so it runs fast and free. Decision support only, not clinical advice. Thank you." |
| *(optional)* 1:52 | Back to Risk Overview. Untick **Low** and **Medium**, choose city **Dhaka South**, search `ward_1`. | "Officers can filter to just the high-risk wards in one city, or search by ward ID." |
| *(optional)* 2:10 | Sidebar: **Ward Risk Heatmap** (matrix). | "The matrix view shows every ward against every horizon and the last eight weeks, to see risk building over time." |
| *(optional)* 2:25 | Top bar: alert bell, then **বাংলা**. | "Alerts are counted from real High and Critical forecasts, and the whole interface works in Bangla." |
| *(optional)* 2:40 | Closing line from 1:52. | |

## Checklist after recording

- [ ] The video is no longer than the target (2:00 for the rulebook, 3:00 at most), one continuous take, with clear voice audio.
- [ ] The browser address bar shows `localhost:8000` at least once.
- [ ] Upload it (YouTube unlisted or Google Drive, with "Anyone with the link" access), then open the link in an incognito window to confirm it plays.
- [ ] Paste the link into the **Demo** section of the root `README.md`.
