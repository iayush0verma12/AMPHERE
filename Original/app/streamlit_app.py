"""
app/streamlit_app.py — AMPERE demo surface.
Run from repo root:  streamlit run app/streamlit_app.py
"""
import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from config import SOH_WARN, SOH_EOL, LLM_PROVIDER
from data.fleet_sim import build_fleet, fast_forward
from models.degradation import get_model
from models.anomaly import AnomalyDetector
from agent.tools import ToolContext
from agent.orchestrator import run_agent

st.set_page_config(page_title="AMPERE · EV Asset Intelligence",
                   layout="wide", initial_sidebar_state="expanded")

# ---------------------------------------------------------------- styling
st.markdown("""
<style>
:root{--ink:#14171C;--voltage:#1B3BF0;--health:#12A150;--warn:#C98A00;--critical:#E23A3F;}
.block-container{padding-top:1.6rem;max-width:1300px}
h1,h2,h3{font-family:'Space Grotesk','Segoe UI',sans-serif;letter-spacing:-.01em}
.amp-tag{font-family:ui-monospace,monospace;font-size:.72rem;letter-spacing:.16em;
  text-transform:uppercase;color:var(--voltage)}
.kpi{border:1px solid #E1E7EA;border-radius:8px;padding:14px 16px;background:#fff}
.kpi .k{font-family:ui-monospace,monospace;font-size:.66rem;letter-spacing:.12em;
  text-transform:uppercase;color:#6B7681}
.kpi .v{font-size:1.5rem;font-weight:700;font-family:'Space Grotesk',sans-serif}
.step{border-left:3px solid var(--voltage);background:#F6F8FF;padding:8px 12px;
  margin:6px 0;border-radius:0 6px 6px 0;font-size:.9rem}
.step b{font-family:ui-monospace,monospace;color:var(--voltage)}
.decision{border:1px solid var(--voltage);background:#F2F5FF;border-radius:8px;
  padding:16px 18px;font-size:1.02rem;line-height:1.55}
</style>
""", unsafe_allow_html=True)


# ---------------------------------------------------------------- cached build
@st.cache_resource(show_spinner="Training degradation model…")
def bootstrap():
    fleet = build_fleet()
    model = get_model()
    detector = AnomalyDetector().fit(fleet)
    return model, detector, fleet


def health_color(soh):
    if soh <= SOH_EOL + 0.03: return "#E23A3F"
    if soh <= SOH_WARN:        return "#C98A00"
    return "#12A150"


# ---------------------------------------------------------------- header
model, detector, base_fleet = bootstrap()
st.markdown("<span class='amp-tag'>AMPERE · Problem Statement 03</span>",
            unsafe_allow_html=True)
st.title("Industrial EV Asset Intelligence")
st.caption("Predict battery degradation → orchestrate charging & maintenance → "
           "hold availability at minimum battery cost.")

# ---------------------------------------------------------------- sidebar
with st.sidebar:
    st.header("Demo controls")
    st.metric("LLM provider", LLM_PROVIDER)
    st.metric("Degradation model MAPE", f"{model.metrics['mape']}%",
              help="Predicted vs observed cycle-life on held-out cells "
                   f"({model.metrics['data']} data)")
    asset_id = st.selectbox("Hero asset", base_fleet.asset_id.tolist())
    ff = st.slider("Fast-forward this asset (cycles)", 0, 500, 0, 25,
                   help="Age the asset to push it toward the warning threshold.")
    run = st.button("▶  Run AMPERE agent", type="primary", use_container_width=True)

fleet = fast_forward(base_fleet, asset_id, ff) if ff else base_fleet
flagged = detector.flag(fleet)

# ---------------------------------------------------------------- fleet map
st.subheader("Fleet health")
c = st.columns([2, 1])
with c[0]:
    fig = go.Figure()
    for _, r in flagged.iterrows():
        fig.add_trace(go.Scatter(
            x=[r["cycles_done"]], y=[r["soh"]], mode="markers+text",
            text=[r["asset_id"]], textposition="top center",
            marker=dict(size=20 if r["asset_id"] == asset_id else 13,
                        color=health_color(r["soh"]),
                        line=dict(width=2 if r["asset_id"] == asset_id else 0,
                                  color="#1B3BF0")),
            showlegend=False, hovertext=f"{r['asset_id']} · SoH {r['soh']:.2f}"))
    fig.add_hline(y=SOH_WARN, line_dash="dot", line_color="#C98A00",
                  annotation_text="warning")
    fig.add_hline(y=SOH_EOL, line_dash="dot", line_color="#E23A3F",
                  annotation_text="end-of-life")
    fig.update_layout(height=380, margin=dict(l=10, r=10, t=10, b=10),
                      xaxis_title="cycles done", yaxis_title="state of health",
                      plot_bgcolor="#FAFBFC")
    st.plotly_chart(fig, use_container_width=True)
with c[1]:
    n_warn = int((flagged.soh <= SOH_WARN).sum())
    n_anom = int(flagged.anomaly.sum())
    st.markdown(f"<div class='kpi'><div class='k'>Fleet size</div>"
                f"<div class='v'>{len(fleet)}</div></div>", unsafe_allow_html=True)
    st.markdown(f"<div class='kpi' style='margin-top:10px'><div class='k'>Below warning</div>"
                f"<div class='v' style='color:#C98A00'>{n_warn}</div></div>",
                unsafe_allow_html=True)
    st.markdown(f"<div class='kpi' style='margin-top:10px'><div class='k'>Anomalous</div>"
                f"<div class='v' style='color:#E23A3F'>{n_anom}</div></div>",
                unsafe_allow_html=True)

# ---------------------------------------------------------------- agent run
if run:
    ctx = ToolContext(model, detector, fleet)
    st.subheader(f"Agent reasoning · {asset_id}")
    with st.spinner("AMPERE is reasoning over the trade-off…"):
        out = run_agent(ctx, asset_id)

    for s in out["steps"]:
        st.markdown(f"<div class='step'><b>{s['tool']}</b> — {s['thought']}<br>"
                    f"<span style='color:#5A6570;font-size:.82rem'>"
                    f"{json.dumps(s['result'])[:220]}</span></div>",
                    unsafe_allow_html=True)

    st.markdown(f"<div class='decision'>🔋 <b>Recommendation</b><br>{out['explanation']}</div>",
                unsafe_allow_html=True)

    d = out["decision"]
    k = st.columns(4)
    k[0].markdown(f"<div class='kpi'><div class='k'>State of health</div>"
                  f"<div class='v'>{d.get('soh','–')}</div></div>", unsafe_allow_html=True)
    k[1].markdown(f"<div class='kpi'><div class='k'>RUL (cycles)</div>"
                  f"<div class='v'>{d.get('rul_cycles','–')}</div></div>", unsafe_allow_html=True)
    k[2].markdown(f"<div class='kpi'><div class='k'>Charging</div>"
                  f"<div class='v' style='text-transform:capitalize'>{d.get('strategy','–')}</div></div>",
                  unsafe_allow_html=True)
    # Fleet CO2 is a fixed fleet-wide number — compute it directly so it always
    # shows, even if the (small) model finalized before calling compute_carbon.
    from engine.carbon import compute_carbon as _fleet_carbon, asset_carbon as _one_carbon
    fleet_rows = fleet[["route_km", "duty_cycles_per_day"]].to_dict("records")
    co2 = _fleet_carbon(fleet_rows).get("fleet_co2_saved_kg_yr")
    _a = fleet[fleet.asset_id == asset_id].iloc[0]
    asset_co2 = _one_carbon(_a["route_km"], _a["duty_cycles_per_day"])["co2_saved_kg"]
    asset_line = (f"<div style='font-size:.7rem;color:#8894A1;margin-top:3px'>"
                  f"this asset: {asset_co2:,.0f} kg/yr</div>")
    k[3].markdown(f"<div class='kpi'><div class='k'>Fleet CO₂ saved / yr</div>"
                  f"<div class='v'>{co2/1000:.0f} t</div>{asset_line}</div>",
                  unsafe_allow_html=True)

    # ---- counterfactual ----
    cf = d.get("counterfactual")
    if cf:
        st.subheader("Counterfactual — naive vs AMPERE")
        cc = st.columns([1, 1])
        with cc[0]:
            nc = cf["naive_annual_battery_cost"]
            rc = cf["recommended_annual_battery_cost"]
            bar = go.Figure([go.Bar(
                x=["Naive (always fast)", "AMPERE (optimized)"],
                y=[nc, rc],
                marker_color=["#E23A3F", "#12A150"],
                text=[f"₹{nc:,.0f}", f"₹{rc:,.0f}"],
                textposition="outside")])
            bar.update_layout(height=300, yaxis_title="annual battery cost (₹/yr)",
                              margin=dict(l=10, r=10, t=30, b=10), plot_bgcolor="#FAFBFC")
            st.plotly_chart(bar, use_container_width=True)
        with cc[1]:
            st.markdown(f"<div class='kpi'><div class='k'>Battery ₹ saved / yr</div>"
                        f"<div class='v' style='color:#12A150'>"
                        f"₹{cf['inr_saved_per_yr']:,}</div></div>",
                        unsafe_allow_html=True)
            st.markdown(f"<div class='kpi' style='margin-top:10px'>"
                        f"<div class='k'>Pack life extended</div>"
                        f"<div class='v'>+{cf['pack_life_extension_pct']}%</div></div>",
                        unsafe_allow_html=True)

# ---------------------------------------------------------------- model accuracy
with st.expander("Degradation model — predicted vs observed (the hard metric)"):
    m = model.metrics
    fig2 = go.Figure()
    fig2.add_trace(go.Scatter(x=m["y_true"], y=m["y_pred"], mode="markers",
                              marker=dict(color="#1B3BF0", size=8, opacity=.7),
                              name="held-out cells"))
    lo, hi = min(m["y_true"]), max(m["y_true"])
    fig2.add_trace(go.Scatter(x=[lo, hi], y=[lo, hi], mode="lines",
                              line=dict(dash="dash", color="#6B7681"), name="ideal"))
    fig2.update_layout(height=380, xaxis_title="observed cycle life",
                       yaxis_title="predicted cycle life", plot_bgcolor="#FAFBFC",
                       margin=dict(l=10, r=10, t=10, b=10))
    st.plotly_chart(fig2, use_container_width=True)
    st.caption(f"Test MAPE {m['mape']}% · MAE {m['mae_cycles']} cycles · "
               f"{m['data']} data · comparable to the published benchmark "
               f"(Severson et al., Nature Energy 2019, ~9–15% test error).")