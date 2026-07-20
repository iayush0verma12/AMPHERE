import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { api } from "../api.js";
import { usePolling } from "../hooks/usePolling.js";
import GlowingBadge from "../components/GlowingBadge.jsx";
import AnimatedPage, { AnimatedChild } from "../components/AnimatedPage.jsx";
import AnimatedCounter from "../components/AnimatedCounter.jsx";

const SEVERITY_ICONS = {
  CRITICAL: "🔴",
  WARNING: "🟠",
};

export default function AlertsPage() {
  const navigate = useNavigate();
  const { data: alerts, error } = usePolling(api.alerts, 4000);

  if (error) {
    return <div className="empty-state">Could not reach the backend API ({error.message}).</div>;
  }
  if (!alerts) return <div className="empty-state">Loading alerts...</div>;

  const criticalCount = alerts.filter((a) => a.severity === "CRITICAL").length;
  const warningCount = alerts.filter((a) => a.severity === "WARNING").length;

  /* Sort: critical first */
  const sorted = [...alerts].sort((a, b) => {
    if (a.severity === "CRITICAL" && b.severity !== "CRITICAL") return -1;
    if (a.severity !== "CRITICAL" && b.severity === "CRITICAL") return 1;
    return 0;
  });

  return (
    <AnimatedPage>
      <h1 className="page-title">Alerts</h1>
      <p className="page-subtitle">
        Live faults detected by the hybrid rule + anomaly-detection pipeline, fleet-wide.
      </p>

      {/* Summary bar */}
      <AnimatedChild>
        <div className="alerts-summary">
          <div className="alert-summary-card">
            <div className="alert-summary-count" style={{ color: "var(--text)" }}>
              <AnimatedCounter value={alerts.length} />
            </div>
            <div className="alert-summary-label">Total Alerts</div>
          </div>
          <div className="alert-summary-card">
            <div className="alert-summary-count" style={{ color: "var(--critical)" }}>
              <AnimatedCounter value={criticalCount} />
            </div>
            <div className="alert-summary-label">Critical</div>
          </div>
          <div className="alert-summary-card">
            <div className="alert-summary-count" style={{ color: "var(--warning)" }}>
              <AnimatedCounter value={warningCount} />
            </div>
            <div className="alert-summary-label">Warnings</div>
          </div>
        </div>
      </AnimatedChild>

      {/* Alert cards */}
      <AnimatedChild>
        {alerts.length === 0 ? (
          <div className="panel">
            <div className="empty-state">No active alerts across the fleet. ✅</div>
          </div>
        ) : (
          <div className="alert-cards-container">
            {sorted.map((a, i) => (
              <motion.div
                key={`${a.vehicle_id}-${a.type}-${i}`}
                className={`alert-card severity-${a.severity}`}
                onClick={() => navigate(`/vehicle/${a.vehicle_id}`)}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: i * 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <div className={`alert-card-icon ${a.severity}`}>
                  {SEVERITY_ICONS[a.severity] || "⚠"}
                </div>
                <div className="alert-card-body">
                  <div className="alert-card-header">
                    <span className="alert-card-vehicle">{a.vehicle_id}</span>
                    <span className="alert-card-model">{a.model}</span>
                    <GlowingBadge status={a.severity} />
                  </div>
                  <div className={`alert-card-fault ${a.severity}`}>
                    {a.type.replaceAll("_", " ")}
                  </div>
                  <div className="alert-card-message">{a.message}</div>
                </div>
                <div className="alert-card-time">
                  {new Date(a.timestamp).toLocaleString()}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </AnimatedChild>
    </AnimatedPage>
  );
}
