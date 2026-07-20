"""
agent/tools.py
--------------
The five deterministic tools the agent orchestrates. The LLM never does the
math — it decides WHICH tool to call and narrates the result. These wrap the
models and engine behind the exact contracts from the architecture doc.

A ToolContext carries the shared state (models, fleet) so tools stay pure-ish
and easy to test.
"""
from __future__ import annotations
from dataclasses import dataclass
import pandas as pd

from models.degradation import DegradationModel
from models.anomaly import AnomalyDetector
from engine.charging import plan_charging as _plan_charging
from engine.scheduler import schedule_maintenance as _schedule
from engine.carbon import compute_carbon as _carbon, asset_carbon as _asset_carbon


@dataclass
class ToolContext:
    model: DegradationModel
    detector: AnomalyDetector
    fleet: pd.DataFrame

    def asset(self, asset_id: str) -> dict:
        return self.fleet[self.fleet.asset_id == asset_id].iloc[0].to_dict()


# ---- the five tools ------------------------------------------------------
def predict_health(ctx: ToolContext, asset_id: str) -> dict:
    h = ctx.model.asset_health(ctx.asset(asset_id))
    return {"soh": h["soh"], "cycles_done": h["cycles_done"],
            "trend": "declining" if h["soh"] < 0.90 else "stable"}


def estimate_rul(ctx: ToolContext, asset_id: str) -> dict:
    h = ctx.model.asset_health(ctx.asset(asset_id))
    return {"rul_cycles": h["rul_cycles"], "rul_low": h["rul_low"],
            "rul_high": h["rul_high"], "confidence": h["confidence"]}


def plan_charging(ctx: ToolContext, asset_id: str) -> dict:
    return _plan_charging(ctx.asset(asset_id))


def schedule_maintenance(ctx: ToolContext, asset_id: str | None = None) -> dict:
    fleet_health = []
    flagged = ctx.detector.flag(ctx.fleet)
    for _, row in flagged.iterrows():
        h = ctx.model.asset_health(row.to_dict())
        fleet_health.append({
            "asset_id": row["asset_id"], "rul_cycles": h["rul_cycles"],
            "soh": h["soh"], "eol_soh": h["eol_soh"],
            "anomalous": bool(row["anomaly"]),
            "shift_ready_by": row.get("shift_ready_by")})
    return _schedule(fleet_health)


def compute_carbon(ctx: ToolContext, asset_id: str | None = None,
                   charging_delta_cycles: int = 0) -> dict:
    rows = ctx.fleet[["route_km", "duty_cycles_per_day"]].to_dict("records")
    out = _carbon(rows, charging_delta_cycles=charging_delta_cycles)
    if asset_id:
        a = ctx.asset(asset_id)
        out["this_asset_co2_saved_kg_yr"] = _asset_carbon(
            a["route_km"], a["duty_cycles_per_day"])["co2_saved_kg"]
    return out


# ---- registry the orchestrator reads -------------------------------------
TOOLS = {
    "predict_health": {
        "fn": predict_health,
        "desc": "Current state-of-health and trend for an asset. args: asset_id"},
    "estimate_rul": {
        "fn": estimate_rul,
        "desc": "Remaining useful life (cycles) with band + confidence. args: asset_id"},
    "plan_charging": {
        "fn": plan_charging,
        "desc": "Resolve charge-speed vs battery-life trade-off; returns strategy "
                "+ naive-vs-optimized counterfactual. args: asset_id"},
    "schedule_maintenance": {
        "fn": schedule_maintenance,
        "desc": "Fleet maintenance plan respecting bay capacity. args: (none)"},
    "compute_carbon": {
        "fn": compute_carbon,
        "desc": "CO2 avoided vs diesel + charging delta. args: charging_delta_cycles"},
}


def run_tool(ctx: ToolContext, name: str, args: dict) -> dict:
    if name not in TOOLS:
        return {"error": f"unknown tool {name}"}
    fn = TOOLS[name]["fn"]
    try:
        return fn(ctx, **args)
    except TypeError:
        # tolerate the LLM passing/omitting asset_id
        return fn(ctx, **{k: v for k, v in args.items()
                          if k in ("asset_id", "charging_delta_cycles")})