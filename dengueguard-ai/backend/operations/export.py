"""Write sample dispatch exports to exports/ (fully offline).

Run:  python -m backend.operations.export

Uses one documented peak-season stress-test scenario so the samples show
shortages, overflow routing and crew assignments. Re-running overwrites the files.
"""
from __future__ import annotations

import json

import pandas as pd

from backend.config import EXPORTS_DIR
from backend.operations import dispatch
from backend.operations.planner import Scenario, plan
from backend.operations.supplies import get_supply_model
from backend.prediction_engine.engine import get_engine

SAMPLE = dict(as_of="2025-08-25", horizon=2, stock_pct=60.0, total_crews=12, effect_per_crew_pct=10.0,
              max_crews_per_ward=3, capacity_scale_pct=75.0, demand_basis="expected")


def main() -> None:
    eng, sm = get_engine(), get_supply_model()
    sc = Scenario(**{**SAMPLE, "as_of": pd.Timestamp(SAMPLE["as_of"])})
    p = plan(eng, sm, sc)
    EXPORTS_DIR.mkdir(exist_ok=True)
    for sub in ("sms", "whatsapp", "briefs"):
        (EXPORTS_DIR / sub).mkdir(exist_ok=True)

    flagged = [w for w in p["wards"] if w["severity"] != "ok"]
    for lang in ("en", "bn"):
        (EXPORTS_DIR / "sms" / f"sms_all_wards_{lang}.txt").write_text(
            "\n".join(dispatch.sms(p, w, lang) for w in p["wards"]) + "\n", encoding="utf-8")
        (EXPORTS_DIR / "whatsapp" / f"whatsapp_flagged_wards_{lang}.txt").write_text(
            "\n\n----------\n\n".join(dispatch.whatsapp(p, w, lang) for w in flagged) + "\n", encoding="utf-8")
    top = p["wards"][0]
    (EXPORTS_DIR / "sms" / f"sms_{top['ward_id']}_en.txt").write_text(dispatch.sms(p, top, "en") + "\n", encoding="utf-8")
    (EXPORTS_DIR / "whatsapp" / f"whatsapp_{top['ward_id']}_en.txt").write_text(dispatch.whatsapp(p, top, "en") + "\n", encoding="utf-8")

    (EXPORTS_DIR / "briefs" / "brief_all_wards.html").write_text(dispatch.brief_html(p, None), encoding="utf-8")
    for city in sorted({w["city"] for w in p["wards"]}):
        (EXPORTS_DIR / "briefs" / f"brief_{city.replace(' ', '_')}.html").write_text(dispatch.brief_html(p, city), encoding="utf-8")
    (EXPORTS_DIR / "plan_sample.json").write_text(json.dumps(p, indent=1, default=str), encoding="utf-8")
    (EXPORTS_DIR / "scenario.json").write_text(json.dumps(SAMPLE, indent=1), encoding="utf-8")
    print(f"Wrote exports to {EXPORTS_DIR} ({len(p['wards'])} wards, {len(flagged)} flagged, {len(p['transfers'])} transfers)")


if __name__ == "__main__":
    main()
