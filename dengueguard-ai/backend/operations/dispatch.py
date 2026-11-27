"""Template-based dispatch notices (no LLM, no network): SMS, WhatsApp and a
printable HTML commissioner brief. Every number comes from planner.plan()."""
from __future__ import annotations

from datetime import datetime, timezone
from html import escape

import numpy as np

from backend.operations.supplies import get_supply_model

SUPPLY_LABEL = {
    "en": {"saline_bags_needed": "Saline", "diagnostic_kits_needed": "Kits", "hospital_beds_required": "Beds"},
    "bn": {"saline_bags_needed": "স্যালাইন", "diagnostic_kits_needed": "কিট", "hospital_beds_required": "বেড"},
}
SEVERITY = {"en": {"critical": "CRITICAL", "warning": "WARNING", "ok": "OK"},
            "bn": {"critical": "জরুরি", "warning": "সতর্কতা", "ok": "স্বাভাবিক"}}
TIER_BN = {"Low": "নিম্ন", "Medium": "মাঝারি", "High": "উচ্চ", "Critical": "সংকটপূর্ণ"}
BN_DIGITS = str.maketrans("0123456789", "০১২৩৪৫৬৭৮৯")


def _n(x, lang: str) -> str:
    s = str(x)
    return s.translate(BN_DIGITS) if lang == "bn" else s


def _deficits(w: dict) -> list[str]:
    out = []
    for c in ("saline_bags_needed", "diagnostic_kits_needed"):
        a = w["allocated"][c]
        if a is not None and a < w["required"][c]:
            out.append(c)
    if w["beds"]["net_deficit"] > 0:
        out.append("hospital_beds_required")
    return out


def _transfers_for(plan: dict, ward_id: str) -> tuple[list[dict], list[dict]]:
    out = [t for t in plan["transfers"] if t["from_ward"] == ward_id]
    inn = [t for t in plan["transfers"] if t["to_ward"] == ward_id]
    return out, inn


def sms(plan: dict, w: dict, lang: str = "en") -> str:
    s = plan["scenario"]
    L = SUPPLY_LABEL[lang]
    sal, kit = "saline_bags_needed", "diagnostic_kits_needed"
    b = w["beds"]
    secured = b["required"] - b["net_deficit"]
    d = _deficits(w)
    if lang == "bn":
        parts = [f"ডেঙ্গুগার্ড {w['ward_id']} {_n(s['target_date'], lang)}: {SEVERITY[lang][w['severity']]}।",
                 f"পূর্বাভাস {_n(w['planning_cases_whole'], lang)} রোগী।",
                 f"{L[sal]} {_n(w['allocated'][sal], lang)}/{_n(w['required'][sal], lang)},"
                 f" {L[kit]} {_n(w['allocated'][kit], lang)}/{_n(w['required'][kit], lang)},"
                 f" {L['hospital_beds_required']} {_n(secured, lang)}/{_n(b['required'], lang)}।",
                 f"স্প্রে দল {_n(w['crews'], lang)}।"]
        if d:
            parts.append("ঘাটতি: " + ", ".join(L[c] for c in d) + "।")
        return " ".join(parts)
    parts = [f"DENGUEGUARD {w['ward_id']} wk {s['target_date']}: {SEVERITY[lang][w['severity']]}.",
             f"Pred {w['planning_cases_whole']} cases.",
             f"{L[sal]} {w['allocated'][sal]}/{w['required'][sal]}, {L[kit]} {w['allocated'][kit]}/{w['required'][kit]},"
             f" Beds {secured}/{b['required']}" + (f" ({b['routed_out']} routed)" if b["routed_out"] else "") + ".",
             f"Crews {w['crews']}."]
    if d:
        parts.append("Deficit: " + ",".join(L[c].lower() for c in d) + ".")
    return " ".join(parts)


def whatsapp(plan: dict, w: dict, lang: str = "en") -> str:
    s = plan["scenario"]
    L = SUPPLY_LABEL[lang]
    b = w["beds"]
    out_t, in_t = _transfers_for(plan, w["ward_id"])
    d = _deficits(w)
    lo, hi = w["interval"]
    basis = "upper 90% bound" if s["demand_basis"] == "upper" else "expected forecast"
    if lang == "bn":
        lines = [f"*ডেঙ্গুগার্ড ডিসপ্যাচ — {w['ward_id']} ({w['city']})*",
                 f"অবস্থা: *{SEVERITY[lang][w['severity']]}* · ঝুঁকি: {TIER_BN.get(w['risk_tier'], w['risk_tier'])}",
                 f"লক্ষ্য সপ্তাহ: {_n(s['target_date'], lang)} ({_n(s['horizon_weeks'], lang)} সপ্তাহ পরে)",
                 f"পূর্বাভাসিত রোগী: *{_n(w['planning_cases_whole'], lang)}* (৯০% সীমা {_n(lo, lang)}–{_n(hi, lang)})",
                 "", "*সরবরাহ (বরাদ্দ / প্রয়োজন)*"]
        for c in ("saline_bags_needed", "diagnostic_kits_needed"):
            lines.append(f"• {L[c]}: {_n(w['allocated'][c], lang)} / {_n(w['required'][c], lang)}")
        lines.append(f"• {L['hospital_beds_required']}: {_n(b['required'] - b['net_deficit'], lang)} / {_n(b['required'], lang)}"
                     f" (স্থানীয় ধারণক্ষমতা {_n(b['capacity'], lang)})")
        for t in out_t:
            lines.append(f"  → {_n(t['patients'], lang)} জন রোগী {t['to_ward']}-এ স্থানান্তর")
        for t in in_t:
            lines.append(f"  ← {t['from_ward']} থেকে {_n(t['patients'], lang)} জন রোগী গ্রহণ")
        lines += ["", f"*স্প্রে দল:* {_n(w['crews'], lang)}"]
        if d:
            lines.append("⚠️ *ঘাটতি:* " + ", ".join(L[c] for c in d))
        lines += ["", "_পরিকল্পনা পরিস্থিতি; ধারণক্ষমতা ও মজুত সম্পাদনযোগ্য অনুমান, সরকারি তথ্য নয়।_"]
        return "\n".join(lines)
    lines = [f"*DengueGuard dispatch — {w['ward_id']} ({w['city']})*",
             f"Status: *{SEVERITY[lang][w['severity']]}* · Risk tier: {w['risk_tier']}",
             f"Target week: {s['target_date']} ({s['horizon_weeks']} weeks ahead)",
             f"Predicted cases: *{w['planning_cases_whole']}* ({basis}; 90% interval {lo}–{hi})",
             "", "*Supplies (allocated / required)*"]
    for c in ("saline_bags_needed", "diagnostic_kits_needed"):
        lines.append(f"• {L[c]}: {w['allocated'][c]} / {w['required'][c]}")
    lines.append(f"• Beds: {b['required'] - b['net_deficit']} / {b['required']} (local capacity {b['capacity']})")
    for t in out_t:
        lines.append(f"  → route {t['patients']} patient(s) to {t['to_ward']}")
    for t in in_t:
        lines.append(f"  ← receive {t['patients']} patient(s) from {t['from_ward']}")
    lines += ["", f"*Spraying crews assigned:* {w['crews']}"]
    if d:
        lines.append("⚠️ *Deficit:* " + ", ".join(L[c] for c in d))
    lines += ["", "_Planning scenario. Capacity and stock are editable assumptions, not official data._"]
    return "\n".join(lines)


CSS = """
body{font-family:Manrope,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#172033;margin:32px;line-height:1.45}
h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:24px 0 8px;border-bottom:2px solid #ff633e;padding-bottom:4px}
.meta{color:#5f6674;font-size:12px}table{border-collapse:collapse;width:100%;font-size:12px}
th,td{border:1px solid #e0d6c6;padding:5px 6px;text-align:right}th{background:#f4eedf;text-align:center}
td.l,th.l{text-align:left}.crit{color:#b3261e;font-weight:700}.warn{color:#9a6700;font-weight:700}.ok{color:#15803d}
.kpis{display:flex;gap:12px;flex-wrap:wrap}.kpi{border:1px solid #e0d6c6;border-radius:8px;padding:8px 12px;min-width:120px}
.kpi b{display:block;font-size:18px}.note{font-size:11px;color:#5f6674}ul{margin:4px 0 0 18px;padding:0}
@media print{body{margin:12mm}.noprint{display:none}h2{break-after:avoid}tr{break-inside:avoid}}
"""


def brief_html(plan: dict, city: str | None = None) -> str:
    s = plan["scenario"]
    wards = [w for w in plan["wards"] if city is None or w["city"] == city]
    cities = [c for c in plan["cities"] if city is None or c["city"] == city]
    transfers = [t for t in plan["transfers"] if city is None or t["city"] == city]
    title = f"Commissioner brief — {city or 'All 60 wards'}"
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    e = escape
    sev_cls = {"critical": "crit", "warning": "warn", "ok": "ok"}
    crit = sum(1 for w in wards if w["severity"] == "critical")
    short = sum(1 for w in wards if w["flags"])
    rows = []
    for w in sorted(wards, key=lambda w: -w["priority"]):
        b = w["beds"]
        a = w["allocated"]
        rq = w["required"]
        fmt = lambda c: f"{a[c]}/{rq[c]}" if a[c] is not None else f"–/{rq[c]}"
        rows.append(
            f"<tr><td class=l>{e(w['ward_id'])}</td><td class=l>{e(w['risk_tier'])}</td><td>{w['priority']}</td>"
            f"<td>{w['planning_cases_whole']}</td><td>{fmt('saline_bags_needed')}</td><td>{fmt('diagnostic_kits_needed')}</td>"
            f"<td>{b['required']}</td><td>{b['capacity']}</td><td>{b['routed_out'] or ''}</td><td>{b['routed_in'] or ''}</td>"
            f"<td>{b['net_deficit'] or ''}</td><td>{w['crews'] or ''}</td>"
            f"<td class='l {sev_cls[w['severity']]}'>{e(w['severity'].upper())}</td></tr>")
    city_rows = "".join(
        f"<tr><td class=l>{e(c['city'])}</td><td>{c['beds_required']}</td><td>{c['bed_capacity']}</td>"
        f"<td>{c['patients_routed']}</td><td>{c['net_deficit']}</td><td>{c['headroom_after_routing']}</td>"
        f"<td>{c['utilisation_pct'] if c['utilisation_pct'] is not None else '–'}%</td></tr>" for c in cities)
    tr_rows = "".join(f"<tr><td class=l>{e(t['city'])}</td><td class=l>{e(t['from_ward'])}</td>"
                      f"<td class=l>{e(t['to_ward'])}</td><td>{t['patients']}</td></tr>" for t in transfers) \
        or "<tr><td class=l colspan=4>No transfers needed: no ward exceeds its planning capacity, or the city has no free beds.</td></tr>"
    # every figure below is scoped to the wards this brief lists (a city, or all 60)
    listed = {w["ward_id"] for w in wards}
    short = {c: sum(w["required"][c] - w["allocated"][c] for w in wards if w["allocated"][c] is not None)
             for c in ("saline_bags_needed", "diagnostic_kits_needed")}
    sup = {c: {"shortfall": v} for c, v in short.items()}
    sim = plan["simulation"]
    sm = get_supply_model()
    ranks = [r for r in sim["ranking"] if r["ward_id"] in listed]
    sim_rows = ""
    for p in sim["per_horizon"]:
        h = p["horizon_weeks"]
        b = np.array([x["baseline"] for r in ranks for x in r["per_horizon"] if x["h"] == h])
        sc = np.array([x["scenario"] for r in ranks for x in r["per_horizon"] if x["h"] == h])
        sb, ss = sm.supplies(b), sm.supplies(sc)
        sim_rows += (f"<tr><td class=l>+{h} wk ({p['target_date']})</td><td>{b.sum():.1f}</td><td>{sc.sum():.1f}</td>"
                     f"<td>{sb['hospital_beds_required'].sum()} → {ss['hospital_beds_required'].sum()}</td>"
                     f"<td>{sb['saline_bags_needed'].sum()} → {ss['saline_bags_needed'].sum()}</td></tr>")
    assumptions = "".join(f"<li>{e(a['text'])}</li>" for a in plan["assumptions"])
    basis = "upper bound of the 90% prediction interval (surge planning)" if s["demand_basis"] == "upper" else "expected forecast"
    pool_note = "" if s["city"] in (None, city) else f" Stock pool: {e(s['city'])}."
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)}</title><style>{CSS}</style></head><body>
<p class="noprint note">Use your browser's Print → Save as PDF to export this brief.</p>
<h1>DengueGuard AI — {e(title)}</h1>
<div class="meta">Reference week {s['as_of']} · target week {s['target_date']} ({s['horizon_weeks']} weeks ahead) · demand basis: {basis}
 · stock {s['stock_pct']:g}% of demand · {s['total_crews']} crews · effect {s['effect_per_crew_pct']:g}%/crew (scenario) · bed capacity {s['capacity_scale_pct']:g}% of baseline.{pool_note}<br>Generated {now}, offline, from deterministic templates.</div>
<h2>Summary</h2><div class="kpis">
<div class="kpi">Wards<b>{len(wards)}</b></div><div class="kpi">Critical alerts<b class="crit">{crit}</b></div>
<div class="kpi">Wards with a shortfall<b>{short}</b></div>
<div class="kpi">Saline short<b>{sup['saline_bags_needed']['shortfall']}</b></div>
<div class="kpi">Kits short<b>{sup['diagnostic_kits_needed']['shortfall']}</b></div>
<div class="kpi">Crews assigned<b>{plan['crews']['assigned']}</b></div></div>
<h2>Ward allocations (sorted by priority)</h2>
<table><tr><th class=l>Ward</th><th class=l>Tier</th><th>Priority</th><th>Pred. cases</th><th>Saline alloc/req</th><th>Kits alloc/req</th>
<th>Beds req</th><th>Bed cap*</th><th>Routed out</th><th>Routed in</th><th>Net bed deficit</th><th>Crews</th><th class=l>Status</th></tr>
{''.join(rows)}</table>
<h2>Hospital beds by city (intra-city routing only)</h2>
<table><tr><th class=l>City</th><th>Beds required</th><th>Capacity*</th><th>Patients routed</th><th>Net deficit</th><th>Headroom left</th><th>Utilisation</th></tr>{city_rows}</table>
<h2>Patient transfers</h2><table><tr><th class=l>City</th><th class=l>From ward</th><th class=l>To ward</th><th>Patients</th></tr>{tr_rows}</table>
<h2>Vector-control scenario (2–4 weeks)</h2>
<table><tr><th class=l>Horizon</th><th>Cases, no action</th><th>Cases, with crews</th><th>Beds</th><th>Saline</th></tr>{sim_rows}</table>
<p class="note">{e(sim['label'])}</p>
<h2>Assumptions</h2><ul class="note">{assumptions}</ul>
<p class="note">* Planning baseline capacity (editable assumption), derived from historical ward demand. Not official hospital capacity data.</p>
</body></html>"""
