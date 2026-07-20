import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ResponsiveContainer, ComposedChart, Scatter, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, BarChart, Bar, Cell,
} from "recharts";
import { ampereApi } from "../ampereApi.js";
import { usePolling } from "../hooks/usePolling.js";
import AnimatedPage, { AnimatedChild } from "../components/AnimatedPage.jsx";
import TiltCard from "../components/TiltCard.jsx";
import AnimatedCounter from "../components/AnimatedCounter.jsx";
import GlowingBadge from "../components/GlowingBadge.jsx";
import ThinkingAnimation from "../components/ThinkingAnimation.jsx";
import { ErrorState } from "./FleetOverview.jsx";

const STATUS_COLOR = { HEALTHY: "#22c55e", WARNING: "#f59e0b", CRITICAL: "#ef4444" };
const SOH_WARN = 0.85;
const SOH_EOL = 0.80;

export default function AIAgentPage() {
  const { data: metric, error: metricError } = usePolling(ampereApi.metric, 60000);
  const { data: fleet, error: fleetError } = usePolling(ampereApi.fleet, 15000);

  const [assetId, setAssetId] = useState(null);
  const [fastForward, setFastForward] = useState(0);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (fleet && !assetId) setAssetId(fleet[0]?.asset_id ?? null);
  }, [fleet, assetId]);

  const accuracyBounds = useAccuracyBounds(metric);

  if (metricError || fleetError) return <ErrorState error={metricError ?? fleetError} />;
  if (!metric || !fleet) return <div className="empty-state">Loading AMPERE bridge (port 8010)...</div>;

  async function handleRun() {
    if (!assetId) return;
    setRunning(true);
    setRunError(null);
    setResult(null);
    try {
      const out = await ampereApi.runAgent(assetId, fastForward);
      setResult(out);
    } catch (err) {
      setRunError(err);
    } finally {
      setRunning(false);
    }
  }

  const hero = fleet.find((v) => v.asset_id === assetId);
  const nWarn = fleet.filter((v) => v.status !== "HEALTHY").length;
  const nAnom = fleet.filter((v) => v.anomaly).length;

  return (
    <AnimatedPage>
      <h1 className="page-title">AI Agent</h1>
      <p className="page-subtitle">
        AMPERE: predicts battery degradation from real cell data, then an agent orchestrates
        charging &amp; maintenance to hold fleet availability at the minimum long-term battery cost.
      </p>

      <AnimatedChild>
        <div className="kpi-row">
          <TiltCard className="kpi-card-inner">
            <div className="kpi-label">Model MAPE</div>
            <div className="kpi-value"><AnimatedCounter value={metric.mape} decimals={1} suffix="%" /></div>
          </TiltCard>
          <TiltCard className="kpi-card-inner">
            <div className="kpi-label">Trained on</div>
            <div className="kpi-value" style={{ fontSize: 22, textTransform: "capitalize" }}>{metric.data} Data</div>
          </TiltCard>
          <TiltCard className="kpi-card-inner">
            <div className="kpi-label">Fleet below warning</div>
            <div className={`kpi-value${nWarn > 0 ? " warning" : " healthy"}`}><AnimatedCounter value={nWarn} /></div>
          </TiltCard>
          <TiltCard className="kpi-card-inner">
            <div className="kpi-label">Anomalous assets</div>
            <div className={`kpi-value${nAnom > 0 ? " critical" : " healthy"}`}><AnimatedCounter value={nAnom} /></div>
          </TiltCard>
        </div>
      </AnimatedChild>

      <AnimatedChild>
        <div className="panel">
          <div className="panel-title">Fleet health — SoH vs. cycles done</div>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart margin={{ top: 8, right: 20, bottom: 8, left: 0 }}>
              <CartesianGrid stroke="rgba(79, 200, 247, 0.06)" />
              <XAxis type="number" dataKey="cycles_done" name="cycles done" tick={{ fill: "#8a9bb8", fontSize: 11 }} />
              <YAxis type="number" dataKey="soh" name="SoH" domain={[0.5, 1]} tick={{ fill: "#8a9bb8", fontSize: 11 }} />
              <Tooltip content={<FleetTooltip />} cursor={{ stroke: "#4fc8f7", strokeWidth: 1 }} />
              <ReferenceLine y={SOH_WARN} stroke="#f59e0b" strokeDasharray="4 4" />
              <ReferenceLine y={SOH_EOL} stroke="#ef4444" strokeDasharray="4 4" />
              <Scatter
                data={fleet}
                onClick={(p) => setAssetId(p.asset_id)}
                shape={(props) => (
                  <AssetDot {...props} isHero={props.payload.asset_id === assetId} />
                )}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </AnimatedChild>

      <AnimatedChild>
        <div className="panel">
          <div className="section-header">
            <span className="panel-title" style={{ margin: 0 }}>Run AMPERE agent</span>
          </div>
          <div className="toolbar">
            <select value={assetId ?? ""} onChange={(e) => { setAssetId(e.target.value); setResult(null); }}>
              {fleet.map((v) => (
                <option key={v.asset_id} value={v.asset_id}>
                  {v.asset_id} · SoH {(v.soh * 100).toFixed(0)}% · {v.status}
                </option>
              ))}
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 12 }}>
              Fast-forward
              <input
                type="range" min={0} max={500} step={25} value={fastForward}
                onChange={(e) => setFastForward(Number(e.target.value))}
              />
              <span className="mono">+{fastForward} cycles</span>
            </label>
            <button onClick={handleRun} disabled={running || !assetId}>
              {running ? "⚡ AMPERE agent working..." : "▶ Run AMPERE agent"}
            </button>
          </div>
          {hero && (
            <div className="stat-row" style={{ marginTop: 16 }}>
              <Stat label="SoH" value={`${(hero.soh * 100).toFixed(1)}%`} />
              <Stat label="RUL (cycles)" value={hero.rul_cycles} />
              <Stat label="Confidence" value={`${(hero.confidence * 100).toFixed(0)}%`} />
              <Stat label="Status" value={<GlowingBadge status={hero.status} />} />
            </div>
          )}

          {/* Thinking animation */}
          {running && <ThinkingAnimation />}

          {runError && (
            <p className="empty-state" style={{ textAlign: "left", paddingLeft: 0, color: "var(--critical)" }}>
              Agent run failed: {runError.message}
            </p>
          )}
        </div>
      </AnimatedChild>

      {result && <AgentTrace key={`${result.asset_id}-${fastForward}`} result={result} />}

      <AnimatedChild>
        <div className="panel">
          <div className="panel-title">
            Degradation model — predicted vs. observed cycle life (MAPE {metric.mape}% · MAE {metric.mae_cycles} cycles)
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart margin={{ top: 8, right: 20, bottom: 8, left: 0 }}>
              <CartesianGrid stroke="rgba(79, 200, 247, 0.06)" />
              <XAxis type="number" dataKey="x" name="observed" domain={accuracyBounds} tick={{ fill: "#8a9bb8", fontSize: 11 }} />
              <YAxis type="number" dataKey="y" name="predicted" domain={accuracyBounds} tick={{ fill: "#8a9bb8", fontSize: 11 }} />
              <Tooltip cursor={{ stroke: "#4fc8f7", strokeWidth: 1 }} />
              <Line
                data={[{ x: accuracyBounds[0], y: accuracyBounds[0] }, { x: accuracyBounds[1], y: accuracyBounds[1] }]}
                dataKey="y" stroke="#8a9bb8" strokeDasharray="5 5" dot={false} activeDot={false} legendType="none"
              />
              <Scatter
                data={metric.y_true.map((yt, i) => ({ x: yt, y: metric.y_pred[i] }))}
                fill="#4fc8f7" fillOpacity={0.75}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </AnimatedChild>
    </AnimatedPage>
  );
}

function useAccuracyBounds(metric) {
  return useMemo(() => {
    if (!metric) return [0, 1];
    const all = [...metric.y_true, ...metric.y_pred];
    const lo = Math.min(...all), hi = Math.max(...all);
    const pad = (hi - lo) * 0.05;
    return [Math.floor(lo - pad), Math.ceil(hi + pad)];
  }, [metric]);
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function FleetTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const v = payload[0].payload;
  return (
    <div className="fleet-tooltip">
      <strong>{v.asset_id}</strong>
      {v.vehicle_type} · {v.cycles_done} cycles · SoH {(v.soh * 100).toFixed(1)}%
      <div className={`tooltip-status ${v.status}`}>{v.status}</div>
      {v.anomaly && <div className="tooltip-faults">anomalous behaviour flagged</div>}
    </div>
  );
}

function AssetDot({ cx, cy, isHero, payload }) {
  const color = STATUS_COLOR[payload.status] ?? "#4fc8f7";
  return (
    <circle
      cx={cx} cy={cy} r={isHero ? 8 : 5}
      fill={color} fillOpacity={0.85}
      stroke={isHero ? "#4fc8f7" : "none"} strokeWidth={isHero ? 2 : 0}
      style={{ cursor: "pointer", filter: isHero ? "drop-shadow(0 0 6px rgba(79,200,247,0.5))" : "none" }}
    />
  );
}

const TOOL_LABEL = {
  predict_health: "Check current state-of-health",
  estimate_rul: "Estimate remaining useful life",
  plan_charging: "Resolve charge-speed vs. battery-life trade-off",
  schedule_maintenance: "Slot the asset into the workshop",
  compute_carbon: "Quantify the carbon impact",
};

function AgentTrace({ result }) {
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    setVisible(0);
    const id = setInterval(() => {
      setVisible((v) => {
        if (v >= result.steps.length) {
          clearInterval(id);
          return v;
        }
        return v + 1;
      });
    }, 550);
    return () => clearInterval(id);
  }, [result]);

  const d = result.decision ?? {};
  const cf = d.counterfactual;
  const showDecision = visible >= result.steps.length;

  return (
    <AnimatedChild>
      <div className="panel">
        <div className="panel-title">Agent reasoning · {result.asset_id}</div>

        <AnimatePresence>
          {result.steps.slice(0, visible).map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="agent-step"
            >
              <span className="agent-step-tool mono">{s.tool}</span>
              <span> — {s.thought || TOOL_LABEL[s.tool] || ""}</span>
              <div className="agent-step-result mono">{JSON.stringify(s.result).slice(0, 200)}</div>
            </motion.div>
          ))}
        </AnimatePresence>

        <AnimatePresence>
          {showDecision && (
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <div className="agent-decision">
                <strong>⚡ Recommendation</strong>
                <p style={{ margin: "6px 0 0 0" }}>{result.explanation}</p>
              </div>

              <div className="stat-row" style={{ marginTop: 18 }}>
                <Stat label="State of health" value={d.soh != null ? `${(d.soh * 100).toFixed(1)}%` : "–"} />
                <Stat label="RUL (cycles)" value={d.rul_cycles ?? "–"} />
                <Stat label="Charging" value={<span style={{ textTransform: "capitalize" }}>{d.strategy ?? "–"}</span>} />
                <Stat label="Fleet CO2 saved / yr" value={d.co2_saved_kg_yr != null ? `${(d.co2_saved_kg_yr / 1000).toFixed(0)} t` : "–"} />
              </div>

              {cf && (
                <div className="grid-2" style={{ marginTop: 20 }}>
                  <div>
                    <div className="panel-title" style={{ fontSize: 11 }}>Counterfactual — naive vs. AMPERE</div>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={[
                        { name: "Naive (fast)", value: cf.naive_annual_battery_cost, tone: "critical" },
                        { name: "AMPERE", value: cf.recommended_annual_battery_cost, tone: "healthy" },
                      ]}>
                        <CartesianGrid stroke="rgba(79, 200, 247, 0.06)" />
                        <XAxis dataKey="name" tick={{ fill: "#8a9bb8", fontSize: 11 }} />
                        <YAxis tick={{ fill: "#8a9bb8", fontSize: 11 }} />
                        <Tooltip formatter={(v) => `₹${Number(v).toLocaleString()}`} />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                          <Cell fill="#ef4444" />
                          <Cell fill="#22c55e" />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="stat-row" style={{ alignContent: "flex-start" }}>
                    <Stat label="₹ saved / yr" value={`₹${cf.inr_saved_per_yr.toLocaleString()}`} />
                    <Stat label="Pack life extended" value={`+${cf.pack_life_extension_pct}%`} />
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AnimatedChild>
  );
}
