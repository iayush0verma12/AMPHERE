"""
agent/orchestrator.py
---------------------
The agentic loop. The LLM chooses tools one at a time, we execute them
deterministically, feed results back, and repeat until it produces a final
recommendation. Provider-agnostic (plain JSON over a text completion), so it
runs identically on the mock reasoner, Ollama, Claude, or OpenAI.

Robustness: if the model returns unparseable output or stalls, we fall back to
the canonical tool order so a live demo can never hard-fail.
"""
from __future__ import annotations
import json
import re

from config import AGENT_MAX_STEPS
from llm import get_llm
from agent.tools import ToolContext, TOOLS, run_tool
from agent.prompts import SYSTEM, build_prompt

CANONICAL = ["predict_health", "estimate_rul", "plan_charging",
             "schedule_maintenance", "compute_carbon"]


def _parse(text: str) -> dict | None:
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def run_agent(ctx: ToolContext, asset_id: str, provider: str | None = None) -> dict:
    llm = get_llm(provider)
    called: list[str] = []
    transcript: list[dict] = []      # [{tool, args, result, thought}]

    for _ in range(AGENT_MAX_STEPS + 1):
        prompt = build_prompt(asset_id, TOOLS, called, transcript)
        raw = llm.complete(SYSTEM, prompt)
        action = _parse(raw)

        # --- fallback if the model misbehaves -------------------------
        if action is None:
            nxt = next((t for t in CANONICAL if t not in called), None)
            action = ({"type": "final", "explanation": raw.strip()[:400]}
                      if nxt is None else
                      {"type": "call", "tool": nxt, "args": {},
                       "thought": "auto"})

        if action.get("type") == "final":
            return {
                "asset_id": asset_id,
                "provider": llm.name,
                "steps": transcript,
                "decision": _decision(transcript),
                "explanation": action.get("explanation", "").strip(),
            }

        tool = action.get("tool")
        if tool not in TOOLS or tool in called:
            # skip repeats/unknowns, nudge toward next canonical tool
            tool = next((t for t in CANONICAL if t not in called), None)
            if tool is None:
                continue
        args = action.get("args", {}) or {}
        if tool in ("predict_health", "estimate_rul", "plan_charging", "compute_carbon"):
            args.setdefault("asset_id", asset_id)
        result = run_tool(ctx, tool, args)
        transcript.append({"tool": tool, "args": args, "result": result,
                           "thought": action.get("thought", "")})
        called.append(tool)

    # ran out of steps -> synthesize a real, numbers-grounded final explanation
    from agent.prompts import synthesize_explanation
    return {"asset_id": asset_id, "provider": llm.name, "steps": transcript,
            "decision": _decision(transcript),
            "explanation": synthesize_explanation(transcript)}


def _decision(transcript: list[dict]) -> dict:
    """Pull the headline numbers out of the transcript for the UI/demo."""
    d = {}
    for t in transcript:
        r = t["result"]
        if t["tool"] == "predict_health":
            d["soh"] = r.get("soh")
        if t["tool"] == "estimate_rul":
            d["rul_cycles"] = r.get("rul_cycles")
            d["confidence"] = r.get("confidence")
        if t["tool"] == "plan_charging":
            d["strategy"] = r.get("strategy")
            d["counterfactual"] = r.get("counterfactual")
        if t["tool"] == "schedule_maintenance":
            slot = next((p for p in r.get("plan", [])), None)
            d["maintenance"] = slot
        if t["tool"] == "compute_carbon":
            d["co2_saved_kg_yr"] = r.get("fleet_co2_saved_kg_yr")
            d["this_asset_co2_saved_kg_yr"] = r.get("this_asset_co2_saved_kg_yr")
    return d


if __name__ == "__main__":
    from data.fleet_sim import build_fleet
    from models.degradation import get_model
    from models.anomaly import AnomalyDetector

    fleet = build_fleet()
    ctx = ToolContext(get_model(), AnomalyDetector().fit(fleet), fleet)
    out = run_agent(ctx, fleet.iloc[0].asset_id)
    print(f"\nProvider: {out['provider']}")
    for s in out["steps"]:
        print(f"  -> {s['tool']}: {s['thought']}")
    print("\nDECISION:", json.dumps(out["decision"], indent=2))
    print("\nEXPLANATION:", out["explanation"])