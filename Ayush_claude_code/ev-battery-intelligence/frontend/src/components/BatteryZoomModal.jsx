/**
 * BatteryZoomModal — full-screen in-page zoom into one vehicle's real
 * battery pack, opened by clicking a cell in the FleetGrid3D overview.
 * Reuses BatteryPack3D (the detailed 12-cell digital twin) with live
 * per-cell voltage data fetched for just this vehicle.
 */

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../api.js";
import { usePolling } from "../hooks/usePolling.js";
import GlowingBadge from "../components/GlowingBadge.jsx";
import BatteryPack3D from "./BatteryPack3D.jsx";
import BatteryPackLegend from "./BatteryPackLegend.jsx";
import { Canvas3DErrorBoundary } from "./Canvas3DErrorBoundary.jsx";

export default function BatteryZoomModal({ vehicleId, onClose }) {
  const { data: battery, error } = usePolling(() => api.battery(vehicleId), 4000, [vehicleId]);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        className="battery-zoom-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="battery-zoom-panel"
          initial={{ opacity: 0, scale: 0.92, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="battery-zoom-close" onClick={onClose} aria-label="Close">×</button>

          {error && <div className="empty-state">Could not load {vehicleId}: {error.message}</div>}
          {!error && !battery && <div className="empty-state">Loading {vehicleId} digital twin...</div>}

          {battery && (
            <>
              <div className="battery-zoom-header">
                <div>
                  <div className="battery-zoom-title">{vehicleId}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{battery.profile.model}</div>
                </div>
                <GlowingBadge status={battery.status} />
              </div>

              <div className="stat-row" style={{ marginBottom: 14 }}>
                <Stat label="SOC" value={`${battery.latest.soc}%`} />
                <Stat label="SOH" value={`${battery.soh_predicted}%`} />
                <Stat label="Pack temp" value={`${battery.latest.pack_temp} °C`} />
                <Stat label="Pack voltage" value={`${battery.latest.pack_voltage} V`} />
              </div>

              <Canvas3DErrorBoundary>
                <BatteryPack3D
                  cellVoltages={battery.latest.cell_voltages}
                  packTemp={battery.latest.pack_temp}
                  faults={battery.active_faults}
                  status={battery.status}
                />
              </Canvas3DErrorBoundary>
              <BatteryPackLegend />
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
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
