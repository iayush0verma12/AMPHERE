# AMPHERE

Industrial EV battery intelligence — degradation prediction, an LLM agent for charging/maintenance
trade-offs, and a live fleet dashboard.

This repo has two parts:

- **`Original/`** — AMPERE: the ML + agentic-AI backend. Real Severson battery-cycling data →
  degradation/anomaly models → an LLM agent that orchestrates charging and maintenance decisions.
  See `Original/README.md`.
- **`Ayush_claude_code/ev-battery-intelligence/`** — the React + Three.js fleet dashboard (3D
  battery packs, live telemetry, fault injection) plus its own FastAPI backend, and a bridge page
  that talks to the AMPERE agent. See `Ayush_claude_code/ev-battery-intelligence/README.md`.
