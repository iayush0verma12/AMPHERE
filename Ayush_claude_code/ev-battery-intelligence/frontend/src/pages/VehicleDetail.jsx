import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from "recharts";
import { api } from "../api.js";
import { usePolling } from "../hooks/usePolling.js";
import GlowingBadge from "../components/GlowingBadge.jsx";
import TiltCard from "../components/TiltCard.jsx";
import AnimatedPage, { AnimatedChild } from "../components/AnimatedPage.jsx";
import BatteryPack3D from "../components/BatteryPack3D.jsx";
import BatteryPackLegend from "../components/BatteryPackLegend.jsx";
import Vehicle3DModel from "../components/Vehicle3DModel.jsx";
import { Canvas3DErrorBoundary } from "../components/Canvas3DErrorBoundary.jsx";
import { ErrorState } from "./FleetOverview.jsx";

const NOMINAL_CELL_V = 3.7;
const OVERVOLTAGE = 4.25;
const UNDERVOLTAGE = 2.8;

export default function VehicleDetail() {
  const { id } = useParams();
  const [faultChoice, setFaultChoice] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: battery, error: batteryError } = usePolling(() => api.battery(id), 4000, [id]);
  const { data: history, error: historyError } = usePolling(() => api.history(id, 120), 4000, [id]);
  const { data: faultTypes } = usePolling(api.faultTypes, 60000, []);

  if (batteryError || historyError) return <ErrorState error={batteryError || historyError} />;
  if (!battery || !history) return <div className="empty-state">Loading vehicle telemetry...</div>;

  const chartHistory = history.map((r) => ({
    ...r,
    time: new Date(r.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  }));

  const cellData = battery.latest.cell_voltages.map((v, i) => ({
    cell: `C${i + 1}`,
    voltage: v,
    isDropout: v === 0,
  }));

  async function handleInject() {
    setBusy(true);
    try {
      await api.injectFault(id, faultChoice || null);
    } finally {
      setBusy(false);
    }
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(battery, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${id}-battery-report.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AnimatedPage>
      <Link to="/" className="back-link">&larr; Back to fleet</Link>
      <h1 className="page-title">
        {id} <span className="muted" style={{ fontWeight: 400, fontSize: 15 }}>({battery.profile.model})</span>
      </h1>
      <p className="page-subtitle">
        {battery.profile.cycle_count.toFixed(0)} cycles &middot; {battery.profile.calendar_age_days.toFixed(0)} days in service
      </p>

      <AnimatedChild>
        <div className="panel">
          <div className="stat-row">
            <Stat label="Status" value={<GlowingBadge status={battery.status} />} />
            <Stat label="SOC" value={`${battery.latest.soc}%`} />
            <Stat label="SOH (AI-predicted)" value={`${battery.soh_predicted}%`} />
            <Stat label="Remaining useful life" value={battery.rul_days > 0 ? `${battery.rul_days} days (~${battery.rul_cycles} cycles)` : "due now"} />
            <Stat label="Pack voltage" value={`${battery.latest.pack_voltage} V`} />
            <Stat label="Pack current" value={`${battery.latest.pack_current} A`} />
            <Stat label="Pack temperature" value={`${battery.latest.pack_temp} °C`} />
          </div>
        </div>
      </AnimatedChild>

      <AnimatedChild>
        <div className="panel">
          <div className="panel-title">Active faults ({battery.active_faults.length})</div>
          {battery.active_faults.length === 0 ? (
            <div className="empty-state">No faults detected — battery operating within nominal limits.</div>
          ) : (
            battery.active_faults.map((f, i) => (
              <div className="fault-item" key={i}>
                <div className="fault-item-head">
                  <strong>{f.type.replaceAll("_", " ")}</strong>
                  <span className={`severity-tag ${f.severity}`}>{f.severity}</span>
                </div>
                <div className="muted">{f.message}</div>
              </div>
            ))
          )}
        </div>
      </AnimatedChild>

      {/* ─── 3D JARVIS Vehicle Model ─── */}
      <AnimatedChild>
        <div className="panel battery-3d-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <Canvas3DErrorBoundary>
            <Vehicle3DModel modelName={battery.profile.model} status={battery.status} />
          </Canvas3DErrorBoundary>
        </div>
      </AnimatedChild>

      {/* ─── 3D Battery Pack Digital Twin ─── */}
      <AnimatedChild>
        <div className="panel battery-3d-panel">
          <div className="panel-title">Battery Pack — 3D Digital Twin</div>
          <Canvas3DErrorBoundary>
            <BatteryPack3D
              cellVoltages={battery.latest.cell_voltages}
              packTemp={battery.latest.pack_temp}
              faults={battery.active_faults}
              status={battery.status}
            />
          </Canvas3DErrorBoundary>
          <BatteryPackLegend />
        </div>
      </AnimatedChild>

      <div className="grid-2">
        <AnimatedChild>
          <div className="panel">
            <div className="panel-title">SOC / SOH over time</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#23304a" />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#93a3bc" }} minTickGap={30} />
                <YAxis tick={{ fontSize: 11, fill: "#93a3bc" }} domain={[0, 100]} />
                <Tooltip contentStyle={{ background: "rgba(19,28,46,0.9)", border: "1px solid rgba(79,156,247,0.2)", borderRadius: 8, backdropFilter: "blur(12px)" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="soc" name="SOC %" stroke="#4f9cf7" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="soh" name="SOH %" stroke="#22c55e" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </AnimatedChild>

        <AnimatedChild>
          <div className="panel">
            <div className="panel-title">Pack temperature (°C)</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#23304a" />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#93a3bc" }} minTickGap={30} />
                <YAxis tick={{ fontSize: 11, fill: "#93a3bc" }} />
                <Tooltip contentStyle={{ background: "rgba(19,28,46,0.9)", border: "1px solid rgba(79,156,247,0.2)", borderRadius: 8 }} />
                <ReferenceLine y={55} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "overtemp", fontSize: 10, fill: "#f59e0b" }} />
                <ReferenceLine y={65} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "thermal runaway risk", fontSize: 10, fill: "#ef4444" }} />
                <Line type="monotone" dataKey="pack_temp" name="Pack temp" stroke="#f97316" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </AnimatedChild>

        <AnimatedChild>
          <div className="panel">
            <div className="panel-title">Cell voltages (imbalance / dropout view)</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={cellData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#23304a" />
                <XAxis dataKey="cell" tick={{ fontSize: 11, fill: "#93a3bc" }} />
                <YAxis domain={[0, 4.5]} tick={{ fontSize: 11, fill: "#93a3bc" }} />
                <Tooltip contentStyle={{ background: "rgba(19,28,46,0.9)", border: "1px solid rgba(79,156,247,0.2)", borderRadius: 8 }} />
                <ReferenceLine y={NOMINAL_CELL_V} stroke="#4f9cf7" strokeDasharray="3 3" />
                <ReferenceLine y={OVERVOLTAGE} stroke="#ef4444" strokeDasharray="3 3" />
                <ReferenceLine y={UNDERVOLTAGE} stroke="#ef4444" strokeDasharray="3 3" />
                <Bar dataKey="voltage" name="Cell voltage (V)">
                  {cellData.map((entry, i) => (
                    <Cell key={i} fill={entry.isDropout ? "#64748b" : entry.voltage > OVERVOLTAGE || entry.voltage < UNDERVOLTAGE ? "#ef4444" : "#4f9cf7"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AnimatedChild>

        <AnimatedChild>
          <div className="panel">
            <div className="panel-title">SOH degradation projection (to {80}% end-of-life)</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={battery.soh_projection}>
                <CartesianGrid strokeDasharray="3 3" stroke="#23304a" />
                <XAxis dataKey="cycle" tick={{ fontSize: 11, fill: "#93a3bc" }} />
                <YAxis domain={[60, 100]} tick={{ fontSize: 11, fill: "#93a3bc" }} />
                <Tooltip contentStyle={{ background: "rgba(19,28,46,0.9)", border: "1px solid rgba(79,156,247,0.2)", borderRadius: 8 }} />
                <ReferenceLine y={80} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "EOL 80%", fontSize: 10, fill: "#f59e0b" }} />
                <Line type="monotone" dataKey="soh" name="Projected SOH %" stroke="#22c55e" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </AnimatedChild>
      </div>

      <AnimatedChild>
        <div className="panel">
          <div className="panel-title">Demo controls</div>
          <div className="toolbar">
            <select value={faultChoice} onChange={(e) => setFaultChoice(e.target.value)}>
              <option value="">No fault (nominal)</option>
              {(faultTypes || []).map((t) => (
                <option key={t} value={t}>{t.replaceAll("_", " ")}</option>
              ))}
            </select>
            <button onClick={handleInject} disabled={busy}>
              {faultChoice ? "Inject fault" : "Clear fault"}
            </button>
            <button className="secondary" onClick={handleExport}>Export battery report (JSON)</button>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            Injecting a fault simulates a real BMS event on this vehicle's live telemetry stream so you can watch the
            AI fault-detection pipeline and the 3D digital twin react in real-time.
          </p>
        </div>
      </AnimatedChild>
    </AnimatedPage>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}
