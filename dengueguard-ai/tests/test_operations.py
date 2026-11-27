"""Phase 2: supply rules, constrained allocation, overflow routing, simulator, dispatch."""
import math

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.operations.planner import greedy_crews, route_overflow, water_fill
from backend.operations.supplies import get_supply_model, supply_from_cases

PEAK = {"as_of": "2025-08-25", "horizon_weeks": 2}


@pytest.fixture(scope="module")
def c():
    with TestClient(app) as client:
        yield client


# ---------------------------------------------------------------- supply rules
def test_supply_rules_reproduce_every_workbook_row():
    sm = get_supply_model()
    df = pd.read_csv("data/onsite_supplies.csv")
    for col, r in sm.rates.items():
        assert r.agreement == 1.0
        assert (supply_from_cases(df["dengue_cases"], r.rate) == df[col]).all()
    assert abs(sm.rates["saline_bags_needed"].rate - 2.39) < 0.01
    assert abs(sm.rates["diagnostic_kits_needed"].rate - 1.17) < 0.01
    assert abs(sm.rates["hospital_beds_required"].rate - 0.30) < 0.01


def test_half_up_rounding_matches_dataset():
    # 5 cases x 0.30 = 1.5 would give 2 beds; the workbook says 1 -> fitted rate < 0.30
    sm = get_supply_model()
    assert supply_from_cases([5], sm.rates["hospital_beds_required"].rate)[0] == 1
    assert supply_from_cases([12], sm.rates["saline_bags_needed"].rate)[0] == 29


def test_capacity_baseline_is_whole_and_positive():
    cap = get_supply_model().capacity
    assert len(cap) == 60 and all(isinstance(v, int) and v >= 1 for v in cap.values())


# ---------------------------------------------------------------- algorithms
def test_water_fill_respects_pool_caps_and_priority():
    d = np.array([10, 10, 10, 0])
    w = np.array([1.0, 0.5, 0.25, 1.0])
    a = water_fill(d, w, 15)
    assert a.sum() == 15 and (a <= d).all() and a[3] == 0
    assert a[0] >= a[1] >= a[2]
    assert (water_fill(d, w, 999) == d).all()


def test_greedy_crews_diminishing_returns():
    n = greedy_crews(np.array([40.0, 10.0, 0.0]), np.array([1.0, 1.0, 1.0]), crews=4, e=0.2, cap=3)
    assert n.sum() == 4 and n[0] == 3 and n[1] == 1 and n[2] == 0


def test_routing_stays_within_city_and_conserves_patients():
    df = pd.DataFrame({"ward_id": ["A", "B", "C"], "beds_demand": [7, 1, 2], "capacity": [3, 4, 3], "priority": [1, 1, 1]})
    r, tr = route_overflow(df)
    assert sum(t["patients"] for t in tr) == 4 == r["routed_out"].sum() == r["routed_in"].sum()
    assert r.set_index("ward_id").at["A", "net_deficit"] == 0
    assert tr[0]["to_ward"] == "B"  # lowest-utilisation ward receives first


# ---------------------------------------------------------------- API
def test_plan_scarcity_creates_deficits(c):
    full = c.post("/api/ops/plan", json={**PEAK, "stock_pct": 100}).json()
    scarce = c.post("/api/ops/plan", json={**PEAK, "stock_pct": 30}).json()
    s = scarce["supplies"]["saline_bags_needed"]
    assert full["supplies"]["saline_bags_needed"]["shortfall"] == 0
    assert s["allocated"] == s["available"] == math.ceil(0.3 * s["required"]) and s["shortfall"] > 0
    assert scarce["alerts"]["critical"] > 0
    # higher-priority wards get a larger share of their demand
    w = [x for x in scarce["wards"] if x["required"]["saline_bags_needed"] >= 10]
    fill = lambda x: x["allocated"]["saline_bags_needed"] / x["required"]["saline_bags_needed"]
    assert fill(w[0]) > fill(w[-1])


def test_plan_routing_and_city_pools(c):
    p = c.post("/api/ops/plan", json={**PEAK, "capacity_scale_pct": 75}).json()
    city_of = {w["ward_id"]: w["city"] for w in p["wards"]}
    assert p["transfers"], "a 75% capacity stress test should need routing at peak"
    for t in p["transfers"]:
        assert city_of[t["from_ward"]] == city_of[t["to_ward"]] == t["city"]
    for city in p["cities"]:
        assert city["beds_occupied_after_routing"] <= city["bed_capacity"]


def test_capacity_override_and_manual_deployment(c):
    p = c.post("/api/ops/plan", json={**PEAK, "capacity_overrides": {"DSCC_Ward_04": 50},
                                      "deployment": {"DSCC_Ward_04": 2}}).json()
    w = next(x for x in p["wards"] if x["ward_id"] == "DSCC_Ward_04")
    assert w["beds"]["capacity"] == 50 and w["beds"]["capacity_overridden"] and w["crews"] == 2
    assert p["crews"]["assigned"] == 2 and p["scenario"]["crew_mode"] == "manual"


def test_simulator_multi_horizon_and_roi(c):
    p = c.post("/api/ops/plan", json={**PEAK, "total_crews": 10, "effect_per_crew_pct": 15}).json()
    sim = p["simulation"]
    assert [h["horizon_weeks"] for h in sim["per_horizon"]] == [2, 3, 4]
    assert all(h["cases_scenario"] <= h["cases_baseline"] for h in sim["per_horizon"])
    assert sim["total_cases_prevented"] > 0 and "not a measured causal effect" in sim["label"]
    rois = [r["roi_cases_per_crew"] for r in sim["ranking"] if r["roi_cases_per_crew"]]
    assert rois == sorted(rois, reverse=True)
    none = c.post("/api/ops/plan", json={**PEAK, "total_crews": 0}).json()["simulation"]
    assert none["total_cases_prevented"] == 0


def test_dispatch_and_brief(c):
    d = c.post("/api/ops/dispatch", json={**PEAK, "stock_pct": 50, "ward_id": "DSCC_Ward_04"}).json()
    n = d["notices"][0]
    assert "DSCC_Ward_04" in n["sms"] and "Saline" in n["sms"] and "Crews" in n["sms"]
    assert "allocated / required" in n["whatsapp"]
    # every notice tells the ward what to do, using the same numbers as the plan
    assert "Do: order" in n["sms"] and "*What to do*" in n["whatsapp"] and "Request" in n["whatsapp"]
    assert "Risk tier: Critical" not in n["whatsapp"]
    bn = c.post("/api/ops/dispatch", json={**PEAK, "lang": "bn", "ward_id": "DSCC_Ward_04"}).json()
    assert "স্যালাইন" in bn["notices"][0]["sms"] and "করণীয়" in bn["notices"][0]["whatsapp"]
    html = c.post("/api/ops/brief", json={**PEAK, "brief_city": "Gazipur"}).text
    assert "Commissioner brief" in html and "GCC_Ward_01" in html and "DSCC_Ward_04" not in html
    assert "What each ward should do" in html


def test_actions_follow_the_plan(c):
    from backend.operations import dispatch
    p = c.post("/api/ops/plan", json={**PEAK, "stock_pct": 60, "total_crews": 12, "capacity_scale_pct": 75}).json()
    for w in p["wards"]:
        acts = " ".join(dispatch.actions(p, w, "en"))
        sal = w["required"]["saline_bags_needed"] - w["allocated"]["saline_bags_needed"]
        assert (f"{sal} more saline bag" in acts) == (sal > 0)
        for t in p["transfers"]:
            if t["from_ward"] == w["ward_id"]:
                assert f"to {t['to_ward']} (same city)" in acts
        assert (" spraying team" in acts and "Deploy" in acts) == (w["crews"] > 0)
        assert ("no free bed" in acts) == (w["beds"]["net_deficit"] > 0)


def test_ops_validation_errors(c):
    assert c.post("/api/ops/plan", json={**PEAK, "stock_pct": 20}).status_code == 422
    assert c.post("/api/ops/plan", json={**PEAK, "capacity_overrides": {"Nope": 3}}).status_code == 422
    assert c.post("/api/ops/plan", json={**PEAK, "city": "Paris"}).status_code == 404
    a = c.get("/api/ops/assumptions").json()
    assert a["network_required"] is False and a["capacity"]["is_official_data"] is False


# ---------------------------------------------------------------- stock / beds / crew input modes
SAL, KIT = "saline_bags_needed", "diagnostic_kits_needed"
EXACT = {**PEAK, "stock_mode": "exact"}


def _plan(c, **kw):
    r = c.post("/api/ops/plan", json={**PEAK, **kw})
    assert r.status_code == 200, r.text
    return r.json()


def _check_pool_conservation(p):
    """No ward gets more than it needs and the pool never hands out more than it has."""
    for col in (SAL, KIT):
        s = p["supplies"][col]
        pool = [w for w in p["wards"] if w["in_pool"]]
        alloc = sum(w["allocated"][col] for w in pool)
        assert alloc == s["allocated"] <= s["available"]
        assert all(w["allocated"][col] <= w["required"][col] for w in pool)
        assert s["unused"] == s["available"] - s["allocated"] >= 0
        assert s["shortfall"] == s["required"] - s["allocated"]


def test_pct_rounding_rule_is_round_up():
    from backend.operations.planner import pct_units
    assert pct_units(30, 1185) == 356 and pct_units(30, 339) == 102 and pct_units(30, 576) == 173
    assert pct_units(30, 1000) == 300  # float noise (300.00000000000006) does not add a unit
    assert pct_units(100, 1185) == 1185 and pct_units(30, 0) == 0


def test_pct_mode_units_match_everywhere(c):
    p = _plan(c, stock_pct=30)
    s, k = p["supplies"][SAL], p["supplies"][KIT]
    assert s["required"] == 1185 and s["available"] == s["allocated"] == 356  # was 355 (floor) vs 356 (UI ceil)
    assert k["required"] == 576 and k["available"] == k["allocated"] == 173
    assert s["source"] == "pct_of_demand" and p["scenario"]["stock_mode"] == "pct"
    _check_pool_conservation(p)
    full = _plan(c, stock_pct=100)["supplies"]
    assert all(full[x]["shortfall"] == 0 and full[x]["allocated"] == full[x]["required"] for x in (SAL, KIT))


@pytest.mark.parametrize("bags", [84, 150, 0, 1])
def test_exact_saline_is_used_as_typed(c, bags):
    p = _plan(c, stock_mode="exact", saline_available=bags, kits_available=576)
    s = p["supplies"][SAL]
    assert s["required"] == 1185 and s["available"] == bags and s["allocated"] == bags  # never raised to 30% (356)
    assert s["shortfall"] == 1185 - bags and s["source"] == "user_entered" and s["verified"] is False
    _check_pool_conservation(p)
    if bags == 0:
        assert all(w["allocated"][SAL] == 0 for w in p["wards"] if w["in_pool"])


def test_exact_stock_above_demand_reports_unused(c):
    p = _plan(c, stock_mode="exact", saline_available=2000, kits_available=900)
    s, k = p["supplies"][SAL], p["supplies"][KIT]
    assert s["allocated"] == 1185 and s["unused"] == 815 and s["shortfall"] == 0
    assert k["allocated"] == 576 and k["unused"] == 324
    _check_pool_conservation(p)


def test_exact_saline_and_kits_are_independent(c):
    p = _plan(c, stock_mode="exact", saline_available=150, kits_available=20)
    s, k = p["supplies"][SAL], p["supplies"][KIT]
    assert (s["available"], s["allocated"]) == (150, 150) and (k["available"], k["allocated"]) == (20, 20)
    assert k["required"] == 576 and k["shortfall"] == 556
    # changing kits alone leaves the saline allocation untouched, ward by ward
    q = _plan(c, stock_mode="exact", saline_available=150, kits_available=500)
    assert [w["allocated"][SAL] for w in p["wards"]] == [w["allocated"][SAL] for w in q["wards"]]
    assert q["supplies"][KIT]["allocated"] == 500


def test_exact_mode_for_one_city_pool(c):
    p = _plan(c, city="Gazipur", stock_mode="exact", saline_available=40, kits_available=10)
    assert p["supplies"][SAL]["required"] == 119 and p["supplies"][SAL]["available"] == 40
    assert all(w["allocated"][SAL] is None for w in p["wards"] if w["city"] != "Gazipur")
    _check_pool_conservation(p)


def test_exact_mode_needs_both_numbers_and_rejects_negatives(c):
    assert c.post("/api/ops/plan", json={**EXACT, "saline_available": 84}).status_code == 422
    assert c.post("/api/ops/plan", json={**EXACT, "saline_available": -1, "kits_available": 3}).status_code == 422
    # percentage mode ignores typed numbers, so a stale value cannot leak into a % plan
    p = _plan(c, stock_pct=30, saline_available=5, kits_available=5)
    assert p["supplies"][SAL]["available"] == 356 and p["scenario"]["saline_available"] is None


def test_split_total_is_exact_and_proportional():
    from backend.operations.planner import split_total
    base = {"A": 10, "B": 5, "C": 1}
    for n in (0, 1, 7, 16, 20, 150):
        out = split_total(base, n)
        assert sum(out.values()) == n and all(v >= 0 for v in out.values())
    assert split_total(base, 32) == {"A": 20, "B": 10, "C": 2}


@pytest.mark.parametrize("beds", [20, 0, 150, 171])
def test_exact_bed_total_all_cities(c, beds):
    p = _plan(c, beds_total=beds)
    cap = sum(x["bed_capacity"] for x in p["cities"])
    assert cap == beds == sum(w["beds"]["capacity"] for w in p["wards"])  # no 25% floor (was min 43)
    assert p["scenario"]["bed_mode"] == "exact" and p["scenario"]["bed_pool"] == "all"
    need = sum(x["beds_required"] for x in p["cities"])
    city_of = {w["ward_id"]: w["city"] for w in p["wards"]}
    for x in p["cities"]:  # occupied never exceeds capacity; deficit is what is left after same-city moves
        assert x["beds_occupied_after_routing"] <= x["bed_capacity"]
        assert x["beds_occupied_after_routing"] + x["net_deficit"] == x["beds_required"]
    for t in p["transfers"]:
        assert city_of[t["from_ward"]] == city_of[t["to_ward"]] == t["city"]
    if beds == 0:
        assert sum(x["net_deficit"] for x in p["cities"]) == need and not p["transfers"]


def test_exact_bed_total_for_one_city_leaves_other_cities_alone(c):
    base = {x["city"]: x["bed_capacity"] for x in _plan(c)["cities"]}
    p = _plan(c, city="Gazipur", beds_total=7)
    got = {x["city"]: x["bed_capacity"] for x in p["cities"]}
    assert got["Gazipur"] == 7 and p["scenario"]["bed_pool"] == "Gazipur"
    assert all(got[k] == v for k, v in base.items() if k != "Gazipur")
    # a per-ward edit on top changes only that ward
    w = next(x["ward_id"] for x in p["wards"] if x["city"] == "Gazipur")
    q = _plan(c, city="Gazipur", beds_total=7, capacity_overrides={w: 9})
    assert next(x for x in q["wards"] if x["ward_id"] == w)["beds"]["capacity"] == 9
    assert all(x["beds"]["capacity"] == y["beds"]["capacity"] for x, y in zip(p["wards"], q["wards"]) if x["ward_id"] != w)
    assert c.post("/api/ops/plan", json={**PEAK, "beds_total": -1}).status_code == 422


def _err(r):
    return r.text


def test_manual_crews_cannot_exceed_total(c):
    r = c.post("/api/ops/plan", json={**PEAK, "total_crews": 3,
                                      "deployment": {"DSCC_Ward_04": 3, "DSCC_Ward_05": 2, "DNCC_Ward_01": 2}})
    assert r.status_code == 422 and "only 3 are available" in _err(r)
    ok = _plan(c, total_crews=3, deployment={"DSCC_Ward_04": 2, "DSCC_Ward_05": 1})
    assert (ok["crews"]["total"], ok["crews"]["assigned"], ok["crews"]["unused"]) == (3, 3, 0)


def test_manual_crews_respect_per_ward_limit(c):
    r = c.post("/api/ops/plan", json={**PEAK, "total_crews": 20, "max_crews_per_ward": 3, "deployment": {"DSCC_Ward_04": 9}})
    assert r.status_code == 422 and "limit of 3 crews per ward" in _err(r)
    assert c.post("/api/ops/dispatch", json={**PEAK, "total_crews": 1, "deployment": {"DSCC_Ward_04": 2}}).status_code == 422
    # automatic mode never breaks either limit
    p = _plan(c, total_crews=25, max_crews_per_ward=2)
    assert p["crews"]["assigned"] <= 25 and max(w["crews"] for w in p["wards"]) <= 2


def test_dispatch_uses_the_exact_plan_numbers(c):
    extra = {"stock_mode": "exact", "saline_available": 84, "kits_available": 20, "beds_total": 150}
    p = _plan(c, **extra)
    d = c.post("/api/ops/dispatch", json={**PEAK, **extra}).json()
    by_ward = {w["ward_id"]: w for w in p["wards"]}
    assert d["notices"]
    for n in d["notices"]:
        w = by_ward[n["ward_id"]]
        assert f"{w['allocated'][SAL]}/{w['required'][SAL]}" in n["sms"]
    html = c.post("/api/ops/brief", json={**PEAK, **extra}).text
    assert "84 saline bags, 20 test kits (not verified inventory)" in html and "150 beds entered by user" in html
