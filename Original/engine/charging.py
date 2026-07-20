"""
engine/charging.py
------------------
The charging trade-off resolver: for a given asset it evaluates every charging
strategy against two conflicting objectives — will it be ready for the next
shift, and what does it cost the battery's life — and returns the recommended
strategy plus the naive-vs-optimized counterfactual (annualized battery cost).
"""
from __future__ import annotations

from config import CHARGING_STRATEGIES, PACK_KWH, PACK_COST_INR


def _hours_to_shift(shift_ready_by: str, now_hour: float = 20.0) -> float:
    """Hours from 'now' (default 20:00 the night before) to the shift ready time."""
    h, m = map(int, shift_ready_by.split(":"))
    target = h + m / 60.0
    delta = (target - now_hour) % 24
    return round(delta if delta > 0 else 24.0, 2)


def _charge_hours(charger_kw: float, kw_mult: float, soc_gap: float = 0.7) -> float:
    """Rough time to add `soc_gap` fraction of pack at the strategy's power."""
    kw = max(charger_kw * kw_mult, 1)
    return round((PACK_KWH * soc_gap) / kw, 2)


def evaluate_strategies(asset: dict, now_hour: float = 20.0) -> list[dict]:
    window = _hours_to_shift(asset["shift_ready_by"], now_hour)
    out = []
    for name, cfg in CHARGING_STRATEGIES.items():
        hrs = _charge_hours(asset["charger_kw"], cfg["kw_mult"])
        out.append({
            "strategy": name,
            "label": cfg["label"],
            "ready_in_hours": hrs,
            "shift_window_hours": window,
            "meets_shift": hrs <= window,
            "life_factor": cfg["life_factor"],
        })
    return out


def plan_charging(asset: dict, now_hour: float = 20.0) -> dict:
    """
    Pick the strategy that meets the shift while PRESERVING THE MOST battery life,
    then quantify the trade-off as annualized battery-replacement cost.

    Model (how a fleet operator actually reasons about it):
      effective pack life  = baseline_cycle_life * life_factor
      years per pack       = effective life / charge sessions per year
      annual battery cost  = pack price / years per pack
    Savings = naive (always-fast) annual cost - recommended annual cost.
    This is naturally bounded below the pack price, so it can never claim to
    save more than a battery is worth.
    """
    options = evaluate_strategies(asset, now_hour)
    feasible = [o for o in options if o["meets_shift"]]

    if feasible:
        # among strategies that make the shift, keep the one that preserves most life
        rec = max(feasible, key=lambda o: o["life_factor"])
        rationale = "meets the shift while preserving the most battery life"
    else:
        rec = min(options, key=lambda o: o["ready_in_hours"])
        rationale = "no strategy fully meets the shift — fastest chosen, cost flagged"

    baseline_life = float(asset.get("cycle_life", 1200))       # cycles to EOL
    sessions_per_year = max(int(asset.get("duty_cycles_per_day", 2)) * 365, 1)

    def annual_battery_cost(life_factor: float) -> float:
        effective_life = max(baseline_life * life_factor, 1.0)
        years_per_pack = effective_life / sessions_per_year
        return PACK_COST_INR / max(years_per_pack, 0.05)

    naive = next(o for o in options if o["strategy"] == "fast")   # naive = always fast
    naive_cost = annual_battery_cost(naive["life_factor"])
    rec_cost = annual_battery_cost(rec["life_factor"])
    saved = max(naive_cost - rec_cost, 0.0)
    life_ext_pct = round((rec["life_factor"] / naive["life_factor"] - 1) * 100, 1)

    return {
        "strategy": rec["strategy"],
        "label": rec["label"],
        "ready_in_hours": rec["ready_in_hours"],
        "shift_window_hours": rec["shift_window_hours"],
        "meets_shift": rec["meets_shift"],
        "rationale": rationale,
        "options": options,
        "counterfactual": {
            "naive_strategy": "fast",
            "recommended_strategy": rec["strategy"],
            "naive_annual_battery_cost": int(round(naive_cost)),
            "recommended_annual_battery_cost": int(round(rec_cost)),
            "inr_saved_per_yr": int(round(saved)),
            "pack_life_extension_pct": life_ext_pct,
        },
    }


if __name__ == "__main__":
    demo_asset = {"shift_ready_by": "06:00", "charger_kw": 60,
                  "cycle_life": 1200, "duty_cycles_per_day": 2}
    r = plan_charging(demo_asset)
    print("Recommended:", r["strategy"], "-", r["rationale"])
    print("Counterfactual:", r["counterfactual"])