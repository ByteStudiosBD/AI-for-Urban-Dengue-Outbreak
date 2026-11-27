"""Phase 2: supply rules, constrained allocation, overflow routing, simulator, dispatch."""
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
    assert s["allocated"] == s["available"] == int(0.3 * s["required"]) and s["shortfall"] > 0
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
