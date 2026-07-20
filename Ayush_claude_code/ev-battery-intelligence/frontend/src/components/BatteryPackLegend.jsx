/**
 * BatteryPackLegend — glassmorphism overlay legend for the 3D pack.
 */

export default function BatteryPackLegend() {
  return (
    <div className="battery-legend">
      <div className="battery-legend-title">Battery Pack Legend</div>
      <div className="legend-items">
        <LegendItem color="#26bf57" label="Nominal voltage" />
        <LegendItem color="#d9b315" label="Marginal" />
        <LegendItem color="#ef4444" label="Over / undervoltage" />
        <LegendItem color="#252a3a" label="Sensor dropout" />
        <LegendItem color="#ff6a00" label="Thermal event (particles)" glow />
      </div>
      <div className="legend-hint">Drag to rotate · Scroll to zoom · Hover for voltage</div>
    </div>
  );
}

function LegendItem({ color, label, glow }) {
  return (
    <div className="legend-item">
      <span
        className="legend-swatch"
        style={{
          background: color,
          boxShadow: glow ? `0 0 8px ${color}` : "none",
        }}
      />
      <span className="legend-label">{label}</span>
    </div>
  );
}
