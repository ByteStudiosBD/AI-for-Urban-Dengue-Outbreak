"""Phase 2 operational planner: constrained allocation, overflow routing and the
"what-if" vector-control simulator. Everything is deterministic, local and
computed from the Phase 1 forecasts (no new model, no network, no LLM).

Pipeline for one scenario
-------------------------
1. Demand      forecast cases per ward (2/3/4 weeks ahead, Phase 1 model) ->
               supplies via the workbook's per-case rule (supplies.py).
               demand_basis="expected" uses the point forecast, "upper" uses the
               upper bound of the calibrated 90% prediction interval (surge planning).
2. Priority    priority = 100 x (w_risk x risk_score/100 + (1-w_risk) x density_norm),
               density_norm = min-max of population_density_sqkm over all 60 wards.
3. Allocation  consumables (saline, kits): available = stock% x total demand in the pool.
               If short, fill rate f_i = min(1, lambda x (0.25 + priority_i/100)) and lambda
               is solved so the pool is used exactly (water-filling): higher-priority wards
               get a higher share of their demand, nobody gets more than they need, and
               every ward with demand gets something. Integer units by largest remainder.
4. Crews       greedy on marginal cases prevented over the 2-4 week window. With a
               per-crew effect e, crew n in a ward prevents base x e x (1-e)^(n-1) cases:
               diminishing returns, so greedy is optimal for this objective.
5. Routing     beds: capacity = editable planning baseline. Within each city only,
               the ward with the largest excess sends patients to the ward with the
               lowest utilisation that still has free beds, until no excess or no
               headroom is left. Unrouted excess = net deficit.
6. Simulator   scenario cases_h = base_h x (1-e)^crews for h = 2,3,4, re-converted
               to beds and saline. ROI = cases prevented per crew.

The per-crew effect is a user-set scenario parameter, NOT an estimated causal
effect: the dataset contains no intervention records.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from backend.config import HORIZONS
from backend.operations.supplies import SupplyModel, round_half_up

CONSUMABLES = ("saline_bags_needed", "diagnostic_kits_needed")
BEDS = "hospital_beds_required"
HIGH_TIERS = {"High", "Critical"}
BASE_WEIGHT = 0.25  # floor of the fill weight so low-priority wards are never zeroed out
CRITICAL_FILL = 0.50            # any ward below 50% of a supply is a critical deficit
CRITICAL_FILL_HIGH_TIER = 0.75  # High/Critical-tier wards are critical below 75%


@dataclass
class Scenario:
    as_of: pd.Timestamp
    horizon: int = 2
    city: str | None = None
    stock_pct: float = 100.0
    total_crews: int = 10
    effect_per_crew_pct: float = 10.0
    max_crews_per_ward: int = 3
    risk_weight: float = 0.7
    demand_basis: str = "expected"           # "expected" | "upper"
    capacity_scale_pct: float = 100.0
    capacity_overrides: dict[str, int] = field(default_factory=dict)
    deployment: dict[str, int] | None = None  # manual crews per ward; None = optimise
    plan_with_intervention: bool = False


# ---------------------------------------------------------------- building blocks
def water_fill(demand: np.ndarray, weight: np.ndarray, available: int) -> np.ndarray:
    """Integer allocation <= demand, summing to min(available, total demand),
    with fill rate proportional to weight (capped at 100%)."""
    demand = demand.astype(int)
    total = int(demand.sum())
    if available >= total:
        return demand.copy()
    if available <= 0 or total == 0:
        return np.zeros_like(demand)
    lo, hi = 0.0, 1.0 / max(weight.min(), 1e-9)
    for _ in range(80):  # bisection on lambda
        lam = (lo + hi) / 2
        if (np.minimum(1.0, lam * weight) * demand).sum() > available:
            hi = lam
        else:
            lo = lam
    real = np.minimum(1.0, lo * weight) * demand
    alloc = np.floor(real).astype(int)
    left = available - int(alloc.sum())
    if left > 0:  # largest remainder, ties -> higher weight, never above demand
        order = np.lexsort((-weight, -(real - alloc)))
        for i in order:
            if left == 0:
                break
            if alloc[i] < demand[i]:
                alloc[i] += 1
                left -= 1
    return alloc


def greedy_crews(base_window: np.ndarray, priority: np.ndarray, crews: int, e: float, cap: int) -> np.ndarray:
    """Assign crews one at a time to the ward with the highest marginal cases prevented."""
    n = np.zeros(len(base_window), dtype=int)
    if e <= 0:
        return n
    for _ in range(max(0, crews)):
        gain = base_window * e * (1 - e) ** n
        gain[n >= cap] = -1
        # tie-break by priority so equal gains go to riskier/denser wards
        i = int(np.lexsort((-priority, -gain))[0])
        if gain[i] <= 0:
            break
        n[i] += 1
    return n


def route_overflow(city_df: pd.DataFrame) -> tuple[pd.DataFrame, list[dict]]:
    """Intra-city routing. city_df columns: ward_id, beds_demand, capacity, priority."""
    d = city_df.copy()
    d["excess"] = (d["beds_demand"] - d["capacity"]).clip(lower=0)
    d["headroom"] = (d["capacity"] - d["beds_demand"]).clip(lower=0)
    d["routed_out"] = 0
    d["routed_in"] = 0
    transfers = []
    while True:
        senders = d[d["excess"] > 0]
        receivers = d[d["headroom"] > 0]
        if senders.empty or receivers.empty:
            break
        s = senders.sort_values(["excess", "priority"], ascending=[False, False]).index[0]
        load = (d.loc[receivers.index, "beds_demand"] + d.loc[receivers.index, "routed_in"]) / d.loc[receivers.index, "capacity"]
        r = load.sort_values(kind="mergesort").index[0]  # lowest-burden ward first
        k = int(min(d.at[s, "excess"], d.at[r, "headroom"]))
        d.at[s, "excess"] -= k
        d.at[s, "routed_out"] += k
        d.at[r, "headroom"] -= k
        d.at[r, "routed_in"] += k
        if transfers and transfers[-1]["from_ward"] == d.at[s, "ward_id"] and transfers[-1]["to_ward"] == d.at[r, "ward_id"]:
            transfers[-1]["patients"] += k
        else:
            transfers.append({"from_ward": d.at[s, "ward_id"], "to_ward": d.at[r, "ward_id"], "patients": k})
    d["net_deficit"] = d["excess"]
    d["beds_occupied"] = np.minimum(d["beds_demand"], d["capacity"]) + d["routed_in"]
    return d, transfers


# ---------------------------------------------------------------- main entry
def plan(eng, sm: SupplyModel, sc: Scenario) -> dict:
    e = float(np.clip(sc.effect_per_crew_pct, 0, 90)) / 100.0
    wr = float(np.clip(sc.risk_weight, 0, 1))

    # ---- forecasts for every horizon at the reference week (all 60 wards)
    fc = {}
    for h in HORIZONS:
        t = eng.table[h]
        fc[h] = t[t["as_of"] == sc.as_of].set_index("ward_id")
    wards = eng.raw.drop_duplicates("ward_id").set_index("ward_id")[["city", "population_density_sqkm"]]
    wards = wards.loc[fc[sc.horizon].index]
    dens = wards["population_density_sqkm"].astype(float)
    dens_norm = (dens - dens.min()) / max(1.0, dens.max() - dens.min())

    main = fc[sc.horizon]
    col = "upper" if sc.demand_basis == "upper" else "predicted_cases"
    priority = 100 * (wr * main["risk_score"] / 100 + (1 - wr) * dens_norm)
    base = {h: fc[h][col].reindex(wards.index).clip(lower=0).to_numpy() for h in HORIZONS}
    window = sum(base[h] for h in HORIZONS)

    # ---- crews: optimiser or manual deployment
    if sc.deployment is not None:
        crews = np.array([max(0, min(int(sc.deployment.get(w, 0)), sc.max_crews_per_ward)) for w in wards.index])
        mode = "manual"
    else:
        # crews only go to wards in the planning pool (one city, or all 60 wards)
        in_pool = np.ones(len(wards), bool) if sc.city is None else (wards["city"] == sc.city).to_numpy()
        crews = greedy_crews(np.where(in_pool, window, 0.0), priority.to_numpy(), sc.total_crews, e, sc.max_crews_per_ward)
        mode = "optimised"
    keep = (1 - e) ** crews
    scen = {h: base[h] * keep for h in HORIZONS}

    # ---- demand used for allocation + routing
    plan_cases = scen[sc.horizon] if sc.plan_with_intervention else base[sc.horizon]
    demand = sm.supplies(plan_cases)

    df = pd.DataFrame({
        "ward_id": wards.index, "city": wards["city"].to_numpy(),
        "population_density_sqkm": dens.astype(int).to_numpy(),
        "risk_tier": main["risk_tier"].to_numpy(), "risk_score": main["risk_score"].to_numpy(),
        "predicted_cases": main["predicted_cases"].to_numpy(), "lower": main["lower"].to_numpy(),
        "upper": main["upper"].to_numpy(), "planning_cases": plan_cases,
        "planning_cases_whole": round_half_up(plan_cases).astype(int),
        "priority": priority.to_numpy(), "crews": crews,
    })
    for c in demand:
        df[f"{c}"] = demand[c]

    pool = df if sc.city is None else df[df["city"] == sc.city]
    weight = BASE_WEIGHT + pool["priority"].to_numpy() / 100

    # ---- 1. constrained allocation of consumables
    supplies_summary = {}
    for c in CONSUMABLES:
        d = pool[c].to_numpy()
        avail = int(np.floor(sc.stock_pct / 100 * d.sum()))
        alloc = water_fill(d, weight, avail)
        df.loc[pool.index, f"{c}_allocated"] = alloc
        supplies_summary[c] = {"required": int(d.sum()), "available": avail, "allocated": int(alloc.sum()),
                               "shortfall": int(d.sum() - alloc.sum()),
                               "wards_short": int((alloc < d).sum())}

    # ---- 2. bed capacity + intra-city overflow routing
    cap_base = pd.Series(sm.capacity).reindex(df["ward_id"]).fillna(1).astype(int).to_numpy()
    cap = np.maximum(0, np.round(cap_base * sc.capacity_scale_pct / 100)).astype(int)
    for i, w in enumerate(df["ward_id"]):
        if w in sc.capacity_overrides:
            cap[i] = max(0, int(sc.capacity_overrides[w]))
    df["capacity_baseline"] = cap_base
    df["capacity"] = cap
    df["capacity_overridden"] = df["ward_id"].isin(sc.capacity_overrides.keys())
    routed, transfers, cities = [], [], []
    for city, g in df.groupby("city", sort=True):
        r, tr = route_overflow(g.rename(columns={BEDS: "beds_demand"})[["ward_id", "beds_demand", "capacity", "priority"]])
        routed.append(r)
        for t_ in tr:
            transfers.append({"city": city, **t_})
        cap_total, dem_total = int(g["capacity"].sum()), int(g[BEDS].sum())
        occ = int(r["beds_occupied"].sum())
        cities.append({
            "city": city, "wards": int(len(g)), "beds_required": dem_total, "bed_capacity": cap_total,
            "beds_occupied_after_routing": occ,
            "utilisation_pct": round(100 * occ / cap_total, 1) if cap_total else None,
            "demand_vs_capacity_pct": round(100 * dem_total / cap_total, 1) if cap_total else None,
            "headroom_after_routing": int(cap_total - occ),
            "patients_routed": int(r["routed_out"].sum()), "net_deficit": int(r["net_deficit"].sum()),
            "wards_over_capacity": int((g[BEDS] > g["capacity"]).sum()),
        })
    rr = pd.concat(routed).set_index("ward_id")
    for c in ("routed_out", "routed_in", "net_deficit", "beds_occupied"):
        df[c] = rr.loc[df["ward_id"], c].to_numpy().astype(int)
    df["bed_utilisation_pct"] = np.where(df["capacity"] > 0, 100 * df["beds_occupied"] / df["capacity"].clip(lower=1), np.nan)

    # ---- flags
    def flags(r) -> list[str]:
        out = []
        for c in CONSUMABLES:
            a = r.get(f"{c}_allocated")
            if a is not None and not np.isnan(a) and a < r[c]:
                out.append(f"{c}_deficit")
        if r["net_deficit"] > 0:
            out.append("bed_deficit")
        if r["risk_tier"] in HIGH_TIERS and r["crews"] == 0:
            out.append("high_risk_no_crew")
        return out

    df["flags"] = df.apply(flags, axis=1)

    def severity(r) -> str:
        # severity is about unmet supply/bed demand; "high_risk_no_crew" is an advisory note only
        if not any(f != "high_risk_no_crew" for f in r["flags"]):
            return "ok"
        # Any unmet demand is flagged (warning). It is CRITICAL when patients have no bed
        # even after routing, when a ward gets under half of a supply, or when a
        # High/Critical-tier ward gets under 75% of a supply.
        fills = [r[f"{c}_allocated"] / r[c] for c in CONSUMABLES if r[c] > 0 and not np.isnan(r.get(f"{c}_allocated", np.nan))]
        worst = min(fills) if fills else 1.0
        if r["net_deficit"] > 0 or worst < CRITICAL_FILL or (r["risk_tier"] in HIGH_TIERS and worst < CRITICAL_FILL_HIGH_TIER):
            return "critical"
        return "warning"

    df["severity"] = df.apply(severity, axis=1)

    # ---- 3. simulator outputs
    sim_h = []
    sup_b = {h: sm.supplies(base[h]) for h in HORIZONS}
    sup_s = {h: sm.supplies(scen[h]) for h in HORIZONS}
    for h in HORIZONS:
        b_sup, s_sup = sup_b[h], sup_s[h]
        sim_h.append({
            "horizon_weeks": h, "target_date": (sc.as_of + pd.Timedelta(weeks=h)).date().isoformat(),
            "cases_baseline": round(float(base[h].sum()), 1), "cases_scenario": round(float(scen[h].sum()), 1),
            "cases_prevented": round(float((base[h] - scen[h]).sum()), 1),
            "beds_baseline": int(b_sup[BEDS].sum()), "beds_scenario": int(s_sup[BEDS].sum()),
            "saline_baseline": int(b_sup["saline_bags_needed"].sum()), "saline_scenario": int(s_sup["saline_bags_needed"].sum()),
            "kits_baseline": int(b_sup["diagnostic_kits_needed"].sum()), "kits_scenario": int(s_sup["diagnostic_kits_needed"].sum()),
            "wards_over_capacity_baseline": int((b_sup[BEDS] > cap).sum()),
            "wards_over_capacity_scenario": int((s_sup[BEDS] > cap).sum()),
        })
    prevented = window - sum(scen[h] for h in HORIZONS)
    first_crew_roi = window * e  # cases the first crew would prevent in each ward
    ranking = []
    for i, w in enumerate(df["ward_id"]):
        ranking.append({
            "ward_id": w, "city": df.at[i, "city"], "risk_tier": df.at[i, "risk_tier"],
            "crews": int(crews[i]), "cases_window_baseline": round(float(window[i]), 2),
            "cases_prevented": round(float(prevented[i]), 2),
            "roi_cases_per_crew": round(float(prevented[i] / crews[i]), 3) if crews[i] else None,
            "first_crew_roi": round(float(first_crew_roi[i]), 3),
            "beds_prevented": int(sum(sup_b[h][BEDS][i] - sup_s[h][BEDS][i] for h in HORIZONS)),
            "saline_prevented": int(sum(sup_b[h]["saline_bags_needed"][i] - sup_s[h]["saline_bags_needed"][i] for h in HORIZONS)),
            "per_horizon": [{"h": h, "baseline": round(float(base[h][i]), 2), "scenario": round(float(scen[h][i]), 2)} for h in HORIZONS],
        })
    ranking.sort(key=lambda r: (-(r["roi_cases_per_crew"] or 0), -r["first_crew_roi"]))
    used = int(crews.sum())

    # ---- serialise wards
    def num(x, nd=2):
        return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), nd)

    ward_rows = []
    for _, r in df.iterrows():
        in_pool = sc.city is None or r["city"] == sc.city
        ward_rows.append({
            "ward_id": r["ward_id"], "city": r["city"], "in_pool": bool(in_pool),
            "population_density_sqkm": int(r["population_density_sqkm"]),
            "risk_tier": r["risk_tier"], "risk_score": num(r["risk_score"], 1), "priority": num(r["priority"], 1),
            "predicted_cases": num(r["predicted_cases"]), "interval": [num(r["lower"]), num(r["upper"])],
            "planning_cases": num(r["planning_cases"]), "planning_cases_whole": int(r["planning_cases_whole"]),
            "required": {c: int(r[c]) for c in (*CONSUMABLES, BEDS)},
            "allocated": {c: (int(r[f"{c}_allocated"]) if in_pool else None) for c in CONSUMABLES},
            "crews": int(r["crews"]),
            "beds": {"required": int(r[BEDS]), "capacity": int(r["capacity"]), "capacity_baseline": int(r["capacity_baseline"]),
                     "capacity_overridden": bool(r["capacity_overridden"]), "routed_out": int(r["routed_out"]),
                     "routed_in": int(r["routed_in"]), "net_deficit": int(r["net_deficit"]),
                     "occupied": int(r["beds_occupied"]), "utilisation_pct": num(r["bed_utilisation_pct"], 1)},
            "flags": r["flags"], "severity": r["severity"],
        })
    ward_rows.sort(key=lambda w: -w["priority"])

    return {
        "scenario": {
            "as_of": sc.as_of.date().isoformat(), "horizon_weeks": sc.horizon,
            "target_date": (sc.as_of + pd.Timedelta(weeks=sc.horizon)).date().isoformat(),
            "city": sc.city, "stock_pct": sc.stock_pct, "total_crews": sc.total_crews,
            "effect_per_crew_pct": sc.effect_per_crew_pct, "max_crews_per_ward": sc.max_crews_per_ward,
            "risk_weight": wr, "demand_basis": sc.demand_basis, "capacity_scale_pct": sc.capacity_scale_pct,
            "capacity_overrides": sc.capacity_overrides, "crew_mode": mode,
            "plan_with_intervention": sc.plan_with_intervention,
        },
        "assumptions": assumptions_text(sm),
        "supplies": supplies_summary,
        "crews": {"total": sc.total_crews if mode == "optimised" else used, "assigned": used,
                  "unused": max(0, sc.total_crews - used) if mode == "optimised" else 0,
                  "high_risk_wards_without_crew": int(sum(1 for w in ward_rows if "high_risk_no_crew" in w["flags"] and w["in_pool"]))},
        "alerts": {"critical": sum(1 for w in ward_rows if w["severity"] == "critical" and w["in_pool"]),
                   "warning": sum(1 for w in ward_rows if w["severity"] == "warning" and w["in_pool"])},
        "wards": ward_rows,
        "cities": cities,
        "transfers": transfers,
        "simulation": {"per_horizon": sim_h, "ranking": ranking,
                       "total_cases_prevented": round(float(prevented.sum()), 1),
                       "roi_cases_per_crew": round(float(prevented.sum() / used), 3) if used else None,
                       "label": "Scenario-based planning output. The per-crew effect is a user-set assumption, not a measured causal effect."},
    }


def assumptions_text(sm: SupplyModel) -> list[dict]:
    r = sm.rates
    return [
        {"id": "supply_rates", "kind": "derived",
         "text": (f"Supplies per whole expected case, fitted from the onsite workbook: saline ~{r['saline_bags_needed'].rate:.3f}, "
                  f"diagnostic kits ~{r['diagnostic_kits_needed'].rate:.3f}, hospital beds ~{r['hospital_beds_required'].rate:.3f}, "
                  "rounded half-up. These reproduce every workbook row.")},
        {"id": "capacity", "kind": "assumption",
         "text": "Planning baseline capacity (editable assumption), derived from historical ward demand: 90th percentile "
                 "of weekly hospital_beds_required per ward, rounded up. Not official hospital capacity data."},
        {"id": "stock", "kind": "scenario",
         "text": "Available stock is a scenario control: a percentage of the projected total demand. It is not official inventory data."},
        {"id": "crews", "kind": "scenario",
         "text": "Total crews and the effect per crew are user-set scenario parameters. The dataset has no intervention records, "
                 "so simulated reductions are planning scenarios, not proven causal estimates."},
    ]
