# AMPHERE

Industrial EV battery intelligence — degradation prediction, an LLM agent for charging/maintenance
trade-offs, and a live fleet dashboard.

This repo has two parts:

- **`Original/`** — AMPERE: the ML + agentic-AI backend. Real Severson battery-cycling data →
  degradation/anomaly models → an LLM agent that orchestrates charging and maintenance decisions.
  See `Original/README.md`.
- **`frontend/ev-battery-intelligence/`** — the React + Three.js fleet dashboard (3D
  battery packs, live telemetry, fault injection) plus its own FastAPI backend, and a bridge page
  that talks to the AMPERE agent. See `frontend/ev-battery-intelligence/README.md`.
- **`Note`** — To use this solution - use qwen 3b model if running on cpu & 7b model if running through gpu. For fast response you can use anthropic api
