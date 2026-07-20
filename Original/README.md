# AMPERE — AI Asset Intelligence for Industrial EV Fleets

> ET2.0 Hackathon · Problem Statement 03 · *AI for Industrial EV Supply Chain & Asset Intelligence*
> **Working name — rename freely.**

AMPERE is a **closed-loop asset-intelligence layer** for industrial EV fleets. It predicts each
battery's degradation from real cell data, then an **agentic AI** orchestrates charging and
maintenance to hold fleet availability at the **minimum long-term battery cost**.

### The core insight
Charging is the one lever that governs *both* battery degradation **and** operational availability —
and the two objectives conflict. Fast-charge to make the shift → kill the expensive pack early.
Gentle-charge to save the pack → risk missing the shift. **Nobody manages this trade-off. AMPERE does.**
That turns two problem-statement pillars into one product instead of two dashboards.

---

## Quickstart (runs with ZERO setup)

```bash
pip install -r requirements.txt
python -m scripts.train                 # trains + caches the degradation model
streamlit run app/streamlit_app.py      # open the dashboard
```

The default `LLM_PROVIDER=mock` runs the **entire agent loop with no Ollama, no API key, no
dataset download** — real models, real numbers, deterministic reasoning. That's your Day-1 win:
clone → run → see the demo. Then upgrade the two pieces below.

---

## Upgrade 1 — a real LLM (the agent's reasoning)

```bash
# Option A — local, free (recommended; run on the GPU laptop)
ollama pull qwen2.5:7b
export LLM_PROVIDER=ollama

# Option B — API as demo insurance
export LLM_PROVIDER=anthropic   # or openai
export ANTHROPIC_API_KEY=sk-ant-...
```

The orchestrator is provider-agnostic — it only asks the model for plain JSON, so the same loop
runs on the mock reasoner, Ollama, Claude, or OpenAI. One env var flips it.

> Note: a Claude *subscription* powers **Claude Code** (your dev tool), not the runtime agent.
> The runtime agent uses Ollama or an API key.

## Upgrade 2 — the real Severson dataset (the hard metric)

The model trains on a Severson-**like** synthetic dataset out of the box so it reports a real
accuracy number immediately. To use the real MIT–Stanford data:

1. Download the Severson et al. (Nature Energy 2019) LFP dataset.
2. Drop the processed files in `data/severson/`.
3. Implement `_load_real()` in `data/load_severson.py` (extract early-cycle features —
   the hero feature is `log10(var(dQ_100(V) − dQ_10(V)))`).

Everything downstream is already wired to whatever the loader returns.

---

## Architecture

```
data/load_severson.py ─┐
                       ├─► models/degradation.py ─► SoH · RUL · uncertainty band
data/fleet_sim.py ─────┘   models/anomaly.py     ─► thermal / outlier flags
                                    │
                                    ▼
                        agent/orchestrator.py  (LLM chooses tools, never does math)
                                    │
        ┌──────────────┬───────────┼───────────────┬────────────────┐
        ▼              ▼           ▼                ▼                ▼
  predict_health  estimate_rul  plan_charging  schedule_maintenance  compute_carbon
                                    │
                      engine/charging.py · scheduler.py · carbon.py
                                    │
                                    ▼
                        app/streamlit_app.py  (fleet map · agent reasoning · counterfactual)
```

Single-process monolith — every module is a plain Python import. No Docker, no microservices.

| File | Does | Owner |
|---|---|---|
| `data/load_severson.py` | Cell dataset + feature extraction (real or synthetic) | GPU |
| `data/fleet_sim.py` | Synthetic fleet bound to real cells | You |
| `models/degradation.py` | SoH/RUL + uncertainty band · **headline MAPE** | GPU |
| `models/anomaly.py` | Thermal / degradation-rate outlier flag | GPU |
| `agent/orchestrator.py` · `tools.py` | Agentic tool-use loop + 5 tools | You |
| `engine/charging.py` | Charge trade-off resolver + counterfactual | You |
| `engine/scheduler.py` | Maintenance scheduler (greedy → OR-Tools stretch) | You |
| `engine/carbon.py` | CO₂ avoided vs diesel | You |
| `app/streamlit_app.py` | Dashboard / demo surface | You |
| `llm.py` | Provider switch (mock/ollama/anthropic/openai) | — |

---

## Demo script (3–4 min) — show the loop, don't tour the UI

1. Pick the hero asset, drag **fast-forward** until its SoH crosses the warning line.
2. Hit **Run AMPERE agent** — watch it call its tools and reason over the trade-off.
3. Read the **counterfactual**: naive fast-charging vs AMPERE — pack life preserved, ₹ saved, CO₂ avoided.
4. Open the **predicted-vs-observed** chart for the accuracy number.

## Problem-statement coverage
- **PS Bullet 1 — EV Asset Performance Management** → degradation + anomaly + predict_health / estimate_rul / plan_charging ✅
- **PS Bullet 2 — Maintenance Operations Optimiser** → engine/scheduler.py + charging-uptime alignment ✅
- **Bonus — Net Zero carbon** → engine/carbon.py ✅

## Stretch goals (only after the demo works)
- `models/degradation_gpu.py` — physics-informed NN residual (GPU)
- OR-Tools scheduler in `engine/scheduler.py`
- Real Severson data via `_load_real()`

## Notes
Economic/degradation constants in `config.py` are **illustrative** — tune them to defensible
sources before the final pitch.
