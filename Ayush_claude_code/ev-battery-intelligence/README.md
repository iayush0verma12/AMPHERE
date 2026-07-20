# EV Battery Intelligence -- Prototype

A scaled-down, working prototype of an enterprise dashboard for industrial EV
battery health monitoring and fault detection, inspired by *"AI-Enhanced
Battery Management Systems for Electric Vehicles"* (E3S Web of Conf. 591,
04001, 2024).

It covers the three things you asked for:

1. **UI** -- a React + Recharts fleet dashboard (fleet overview, per-vehicle
   detail, live alerts).
2. **AI/ML** -- a hybrid pipeline: a Gradient Boosting regressor for
   State-of-Health (SOH) and Remaining-Useful-Life (RUL), plus rule-based
   control-limit checks and an IsolationForest anomaly detector for fault
   detection.
3. **Extra features** -- live "streaming" telemetry simulation, one-click
   fault injection for demos, a JSON report export per vehicle, and a
   PlantUML activity diagram of the whole pipeline (`docs/activity_diagram.puml`).

## Why synthetic data

There's no public dataset for pack-level industrial EV telemetry (per-cell
voltage/current/temperature + injected faults) at the fidelity a BMS dashboard
needs. `backend/ml/data_generator.py` generates it instead, using a
degradation model whose drivers (cycle count, depth-of-discharge, C-rate,
temperature) come straight from the reference paper's SOH section. Swap this
module for a real CAN-bus/BMS ingestion feed when you scale up -- everything
downstream keeps the same schema.

## What maps to the paper

| Paper concept | This prototype |
|---|---|
| SOC / SOH / RUL estimation | `ml/soh_rul_model.py` -- Gradient Boosting regressor + forward projection to the 80% SOH end-of-life convention |
| Fault diagnosis (overcharge, over-discharge, thermal runaway, cell imbalance, sensor faults) | `ml/fault_detection.py` -- explicit rule thresholds for each, from section 3.2 |
| "Ensemble/hybrid models combining statistical + ML methods" | Rules + IsolationForest combined in `evaluate_row()` |
| Cloud/IoT integration, real-time monitoring | FastAPI backend + polling dashboard stand in for the cloud layer; a background thread simulates telemetry ticks the way a real ingestion service would |
| Deep learning (LSTM/CNN/DNN) mentioned as state of the art | Deliberately **not** used here so the prototype trains instantly with no GPU -- see "Scaling up" below for the swap-in path |

## Running it

**Backend** (FastAPI, already trained models included in `backend/artifacts/`):

```
cd backend
py -m pip install -r requirements.txt   # already installed in this environment
py train.py                              # regenerates synthetic fleet + retrains models
py -m uvicorn main:app --reload --port 8000
```

**Frontend** (React + Vite):

```
cd frontend
npm install
npm run dev     # http://localhost:5173, proxies /api to localhost:8000
```

Open `http://localhost:5173`. The fleet ticks live every 4 seconds. Five of
the fourteen demo vehicles start with a pre-seeded fault (thermal event, cell
imbalance, sensor dropout, over/undervoltage) so the dashboard has something
to show immediately. On any vehicle's detail page, use **Demo controls** to
inject or clear a fault on any other vehicle and watch the alert appear
within a couple of ticks.

## API surface

- `GET /api/fleet` -- fleet summary (SOC, SOH, RUL, status, active faults)
- `GET /api/battery/{id}` -- full detail incl. SOH projection curve
- `GET /api/battery/{id}/history?limit=100` -- time series for charts
- `GET /api/alerts` -- fleet-wide active faults
- `POST /api/battery/{id}/inject-fault {"fault_type": "..."}` -- demo control

## Scaling this up

This is intentionally a "simple, working, scalable" first version. Natural
next steps, roughly in the order the paper's own gaps suggest:

1. **Real data**: replace `data_generator.py` with an ingestion consumer
   reading real CAN-bus/BMS telemetry (e.g. via MQTT/Kafka into
   InfluxDB/TimescaleDB); keep the same row schema so the ML layer doesn't change.
2. **Swap in deep learning**: replace the Gradient Boosting SOH model with an
   LSTM/CNN over raw voltage-current-temperature sequences (paper sections
   6.2-6.4) once you have enough real cycling data to justify it.
3. **Persistence**: move the in-memory `FleetSimulator` state to a real
   database; the API layer already treats it as a black box.
4. **Auth & multi-tenant**: add enterprise login and per-fleet data isolation
   before this touches real customer data.
5. **Alerting integrations**: wire the CRITICAL-severity path to email/SMS/CMMS
   webhooks instead of just the dashboard.
6. **Digital twin**: the paper's section 5 (IoT + cloud) and section 6.5
   ("battery-information twin") is a natural fit once real telemetry exists --
   simulate what-if charging/duty-cycle scenarios against the trained models.
