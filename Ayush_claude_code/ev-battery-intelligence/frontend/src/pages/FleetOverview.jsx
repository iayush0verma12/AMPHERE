import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { usePolling } from "../hooks/usePolling.js";
import GlowingBadge from "../components/GlowingBadge.jsx";
import TiltCard from "../components/TiltCard.jsx";
import AnimatedCounter from "../components/AnimatedCounter.jsx";
import AnimatedPage, { AnimatedChild } from "../components/AnimatedPage.jsx";
import FleetGrid3D from "../components/FleetGrid3D.jsx";
import { Canvas3DErrorBoundary } from "../components/Canvas3DErrorBoundary.jsx";

export default function FleetOverview() {
  const navigate = useNavigate();
  const { data: fleet, error } = usePolling(api.fleet, 4000);
  const [view, setView] = useState("3d"); /* '3d' | 'table' */

  if (error) return <ErrorState error={error} />;
  if (!fleet) return <div className="empty-state">Loading fleet telemetry...</div>;

  const critical = fleet.filter((v) => v.status === "CRITICAL").length;
  const warning = fleet.filter((v) => v.status === "WARNING").length;
  const avgSoh = fleet.reduce((sum, v) => sum + v.soh, 0) / fleet.length;

  return (
    <AnimatedPage>
      <h1 className="page-title">Fleet Overview</h1>
      <p className="page-subtitle">
        Battery health, remaining useful life, and fault status across the industrial EV fleet.
      </p>

      <AnimatedChild>
        <div className="kpi-row">
          <TiltCard className="kpi-card-inner">
            <div className="kpi-label">Fleet size</div>
            <div className="kpi-value"><AnimatedCounter value={fleet.length} /></div>
          </TiltCard>
          <TiltCard className="kpi-card-inner">
            <div className="kpi-label">Average SOH</div>
            <div className="kpi-value"><AnimatedCounter value={avgSoh} decimals={1} suffix="%" /></div>
          </TiltCard>
          <TiltCard className="kpi-card-inner">
            <div className="kpi-label">Critical alerts</div>
            <div className={`kpi-value${critical > 0 ? " critical" : " healthy"}`}>
              <AnimatedCounter value={critical} />
            </div>
          </TiltCard>
          <TiltCard className="kpi-card-inner">
            <div className="kpi-label">Warnings</div>
            <div className={`kpi-value${warning > 0 ? " warning" : " healthy"}`}>
              <AnimatedCounter value={warning} />
            </div>
          </TiltCard>
        </div>
      </AnimatedChild>

      <AnimatedChild>
        <div className="section-header">
          <span className="panel-title" style={{ margin: 0 }}>Fleet Vehicles</span>
          <div className="view-toggle">
            <button className={view === "3d" ? "active" : ""} onClick={() => setView("3d")}>
              3D Grid
            </button>
            <button className={view === "table" ? "active" : ""} onClick={() => setView("table")}>
              Table
            </button>
          </div>
        </div>
      </AnimatedChild>

      {view === "3d" ? (
        <AnimatedChild>
          <Canvas3DErrorBoundary>
            <FleetGrid3D fleet={fleet} onVehicleClick={(id) => navigate(`/vehicle/${id}`)} />
          </Canvas3DErrorBoundary>
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            Each vehicle is its own live battery pack — click any cell to open its detail page,
            or drag to orbit the fleet.
          </p>
        </AnimatedChild>
      ) : (
        <AnimatedChild>
          <div className="panel">
            <table>
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Model</th>
                  <th>SOC</th>
                  <th>SOH (AI-predicted)</th>
                  <th>Est. RUL</th>
                  <th>Status</th>
                  <th>Active faults</th>
                </tr>
              </thead>
              <tbody>
                {fleet.map((v) => (
                  <tr key={v.vehicle_id} className="clickable" onClick={() => navigate(`/vehicle/${v.vehicle_id}`)}>
                    <td className="mono">{v.vehicle_id}</td>
                    <td>{v.model}</td>
                    <td>{v.soc}%</td>
                    <td>{v.soh}%</td>
                    <td>{v.rul_days > 0 ? `${Math.round(v.rul_days)} days` : "due now"}</td>
                    <td><GlowingBadge status={v.status} /></td>
                    <td>{v.active_faults.length === 0 ? <span className="muted">none</span> : v.active_faults.map((f) => f.type).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AnimatedChild>
      )}
    </AnimatedPage>
  );
}

function KpiCard({ label, value, tone }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value${tone ? ` ${tone}` : ""}`}>{value}</div>
    </div>
  );
}

export function ErrorState({ error }) {
  return (
    <div className="empty-state">
      Could not reach the backend API ({error.message}). Is <span className="mono">uvicorn main:app</span> running on port 8000?
    </div>
  );
}
