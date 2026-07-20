"""
agent/prompts.py
----------------
System prompt + the per-step prompt builder. Kept out of the orchestrator so
the reasoning behaviour is easy to tune.
"""
from __future__ import annotations
import json

SYSTEM = """You are AMPERE, an asset-intelligence agent for industrial EV fleets.
Your job: for a chosen vehicle, decide how to charge and maintain it so the fleet
stays available at the LOWEST long-term battery cost. You never compute numbers
yourself — you call tools and reason over their results.

The core trade-off you exist to resolve: fast charging keeps a vehicle available
for its next shift but shortens the (expensive) battery's life; gentle charging
preserves the battery but risks missing the shift.

At each step respond with ONE json object, nothing else:
  {"type":"call","tool":"<name>","args":{...},"thought":"<one sentence>"}
or, when you have enough to decide:
  {"type":"final","explanation":"<2-3 sentence recommendation for the operator>"}
"""


def build_prompt(asset_id: str, tools: dict, called: list[str],
                 transcript: list[dict]) -> str:
    tool_lines = "\n".join(f"  - {n}: {t['desc']}" for n, t in tools.items())
    obs = "\n".join(
        f"  [{t['tool']}] -> {json.dumps(t['result'])}" for t in transcript
    ) or "  (none yet)"
    # flatten a few key numbers so even a small model / the mock can narrate them
    flat = _flatten(transcript)
    return f"""TARGET ASSET: {asset_id}

AVAILABLE TOOLS:
{tool_lines}

TOOLS ALREADY CALLED: {called}

OBSERVATIONS SO FAR:
{obs}

KEY NUMBERS: {flat}

Decide the next step. Prefer this order: predict_health, estimate_rul,
plan_charging, schedule_maintenance, compute_carbon. Once ALL FIVE tools have
been called (check TOOLS ALREADY CALLED above), you MUST respond with ONLY the
final json object — {{"type":"final","explanation":"..."}} — and nothing else,
no other tool calls."""


def _flatten(transcript: list[dict]) -> str:
    kv = {}
    for t in transcript:
        r = t["result"]
        if t["tool"] == "estimate_rul":
            kv["rul_cycles"] = r.get("rul_cycles")
        if t["tool"] == "plan_charging":
            kv["chosen_strategy"] = r.get("strategy")
            cf = r.get("counterfactual", {})
            kv["inr_saved_per_yr"] = cf.get("inr_saved_per_yr")
    return ", ".join(f"{k} = {v}" for k, v in kv.items()) or "none"


def synthesize_explanation(transcript: list[dict]) -> str:
    """
    Build a real, numbers-grounded recommendation straight from the tool outputs.
    Used when a smaller/local model fails to emit the exact final-JSON format.
    """
    by_tool = {t["tool"]: t["result"] for t in transcript}
    rul = by_tool.get("estimate_rul", {}).get("rul_cycles")
    strat = by_tool.get("plan_charging", {}).get("strategy")
    cf = by_tool.get("plan_charging", {}).get("counterfactual", {})
    inr = cf.get("inr_saved_per_yr")
    ext = cf.get("pack_life_extension_pct")
    maint = by_tool.get("schedule_maintenance", {}).get("plan", [])
    co2 = by_tool.get("compute_carbon", {}).get("fleet_co2_saved_t_yr")

    if not (rul and strat):
        return "Insufficient tool data to form a recommendation."

    parts = [f"This asset has ~{rul} cycles of life left."]
    if strat and inr is not None:
        parts.append(
            f"Recommended charging strategy: '{strat}', which extends pack life "
            f"by about {ext}% versus naive fast-charging"
            + (f" (~₹{inr:,} lower battery cost per year)." if inr else "."))
    if maint:
        parts.append(f"Maintenance has been slotted in (day {maint[0]['slot']} "
                     f"priority: {maint[0]['reason']}).")
    if co2:
        parts.append(f"Fleet-wide, the optimized approach avoids roughly "
                     f"{co2:.0f} t CO₂/yr versus a diesel baseline.")
    return " ".join(parts)