/**
 * FleetGrid3D — immersive 3D fleet command overview.
 *
 * Every vehicle is rendered as its own miniature battery pack (12 cells,
 * arranged 4x3) instead of an abstract platform icon — click any cell to
 * zoom into that vehicle's full digital twin. Colored by real fleet status,
 * filled to real SOC. Reflective HUD grid floor, no particle sprites (the
 * default Three.js point sprite renders as a flat square, which read as
 * ugly blue blocks under Bloom — removed rather than patched).
 */

import { useRef, useMemo, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, RoundedBox, Edges, Cylinder } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";

const TERMINAL_SILVER = "#b8c4d4";

const STATUS_COLORS = {
  HEALTHY: new THREE.Color(0.13, 0.77, 0.37),
  WARNING: new THREE.Color(0.96, 0.62, 0.04),
  CRITICAL: new THREE.Color(0.94, 0.27, 0.27),
};

const PACK_COLS = 4;
const PACK_ROWS = 3;
const CELL_W = 0.1;
const CELL_H = 0.2;
const CELL_D = 0.08;
const CELL_GAP = 0.025;
const PACK_W = PACK_COLS * (CELL_W + CELL_GAP) - CELL_GAP;
const PACK_H = PACK_ROWS * (CELL_H + CELL_GAP) - CELL_GAP;
const FOOTPRINT = Math.max(PACK_W, PACK_H) + 0.55;

/* ─── one mini cell within a pack ─── */
function MiniCell({ col, row, soc, color, isCritical, onClick, onHoverChange }) {
  const fillRef = useRef();
  const coreRef = useRef();
  const groupRef = useRef();
  const [cellHovered, setCellHovered] = useState(false);
  const x = (col - (PACK_COLS - 1) / 2) * (CELL_W + CELL_GAP);
  const y = (row - (PACK_ROWS - 1) / 2) * (CELL_H + CELL_GAP);
  const fill = Math.max(0.06, soc / 100);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const breathe = 0.5 + 0.5 * Math.sin(t * (isCritical ? 4 : 1.4) + col * 0.6 + row * 0.6);

    if (fillRef.current) {
      fillRef.current.material.emissiveIntensity = isCritical ? 0.5 + 0.5 * breathe : 0.3 + 0.15 * breathe;
    }
    if (coreRef.current) {
      coreRef.current.material.emissiveIntensity = 0.6 + 0.4 * breathe;
    }
    if (groupRef.current) {
      const targetScale = cellHovered ? 1.18 : 1;
      groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.15);
    }
  });

  return (
    <group
      ref={groupRef}
      position={[x, y, 0]}
      onPointerOver={(e) => { e.stopPropagation(); setCellHovered(true); onHoverChange(true); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setCellHovered(false); onHoverChange(false); document.body.style.cursor = "auto"; }}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {/* beveled cell shell */}
      <RoundedBox args={[CELL_W, CELL_H, CELL_D]} radius={0.012} smoothness={2}>
        <meshStandardMaterial color="#0a1020" transparent opacity={0.4} metalness={0.75} roughness={0.2} />
        <Edges linewidth={cellHovered ? 2 : 1.3} color={color} />
      </RoundedBox>

      {/* glowing core — depth beyond a flat outline */}
      <mesh ref={coreRef} scale={[0.4, 0.65, 0.4]}>
        <boxGeometry args={[CELL_W, CELL_H, CELL_D]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>

      {/* charge fill */}
      <mesh ref={fillRef} position={[0, -CELL_H / 2 + (CELL_H * fill) / 2, 0]} scale={[0.72, fill, 0.62]}>
        <boxGeometry args={[CELL_W, CELL_H, CELL_D]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.35}
          transparent
          opacity={0.55}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* terminal cap — metallic button top, like a real cylindrical cell */}
      <Cylinder args={[CELL_W * 0.28, CELL_W * 0.28, CELL_D * 0.15, 12]} rotation={[Math.PI / 2, 0, 0]} position={[0, CELL_H / 2 + 0.002, 0]}>
        <meshStandardMaterial color={TERMINAL_SILVER} metalness={0.9} roughness={0.25} emissive={color} emissiveIntensity={0.15} />
      </Cylinder>
    </group>
  );
}

/* ─── one vehicle's mini pack ─── */
function MiniPack({ vehicle, position, onZoom }) {
  const groupRef = useRef();
  const glowRef = useRef();
  const [hovered, setHovered] = useState(false);
  const hoverCountRef = useRef(0);

  const statusColor = STATUS_COLORS[vehicle.status] || STATUS_COLORS.HEALTHY;
  const isCritical = vehicle.status === "CRITICAL";

  const handleHoverChange = (over) => {
    hoverCountRef.current += over ? 1 : -1;
    setHovered(hoverCountRef.current > 0);
  };

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    const floatY = Math.sin(t * 0.8 + position[0]) * 0.025;
    const targetY = hovered ? 0.1 : floatY;
    groupRef.current.position.y += (targetY - groupRef.current.position.y) * 0.045;

    if (glowRef.current) {
      const base = isCritical ? 0.6 + 0.4 * Math.sin(t * 3) : 0.35;
      glowRef.current.material.emissiveIntensity = hovered ? base + 0.3 : base;
    }
  });

  const cells = useMemo(
    () => Array.from({ length: PACK_COLS * PACK_ROWS }, (_, i) => ({
      col: i % PACK_COLS,
      row: Math.floor(i / PACK_COLS),
    })),
    []
  );

  return (
    <group position={position} ref={groupRef}>
      {/* pedestal */}
      <RoundedBox args={[FOOTPRINT * 0.85, 0.05, FOOTPRINT * 0.65]} radius={0.03} position={[0, -PACK_H / 2 - 0.14, 0]}>
        <meshStandardMaterial color="#0c1426" metalness={0.7} roughness={0.3} />
      </RoundedBox>

      {/* glow ring */}
      <mesh ref={glowRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -PACK_H / 2 - 0.16, 0]}>
        <torusGeometry args={[FOOTPRINT * 0.42, 0.015, 8, 32]} />
        <meshStandardMaterial color={statusColor} emissive={statusColor} emissiveIntensity={0.4} transparent opacity={0.7} />
      </mesh>

      {/* the pack of cells, lying flat/horizontal on the platform */}
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {cells.map(({ col, row }) => (
          <MiniCell
            key={`${col}-${row}`}
            col={col}
            row={row}
            soc={vehicle.soc}
            color={statusColor}
            isCritical={isCritical}
            onClick={() => onZoom(vehicle.vehicle_id)}
            onHoverChange={handleHoverChange}
          />
        ))}
        {/* nickel busbars linking each row's terminals — reads as an assembled pack */}
        {Array.from({ length: PACK_ROWS }, (_, row) => (
          <RoundedBox
            key={`bus-${row}`}
            args={[PACK_W + 0.015, 0.014, 0.02]}
            radius={0.005}
            position={[0, (row - (PACK_ROWS - 1) / 2) * (CELL_H + CELL_GAP) + CELL_H / 2 + 0.01, 0]}
          >
            <meshStandardMaterial color={TERMINAL_SILVER} metalness={0.95} roughness={0.2} transparent opacity={0.85} />
          </RoundedBox>
        ))}
      </group>

      {isCritical && <CriticalBeacon />}

      {hovered && (
        <Html position={[0, PACK_H * 0.9, 0]} center>
          <div className="fleet-tooltip">
            <strong>{vehicle.vehicle_id}</strong>
            <div>{vehicle.model}</div>
            <div>SOC {vehicle.soc}% &middot; SOH {vehicle.soh}%</div>
            <div className={`tooltip-status ${vehicle.status}`}>{vehicle.status}</div>
            {vehicle.active_faults.length > 0 && (
              <div className="tooltip-faults">
                {vehicle.active_faults.map((f) => f.type.replace(/_/g, " ")).join(", ")}
              </div>
            )}
            <div className="tooltip-hint">click a cell to inspect pack</div>
          </div>
        </Html>
      )}
    </group>
  );
}

/* ─── critical beacon ─── */
function CriticalBeacon() {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    const scale = 1 + 0.3 * Math.sin(t * 4);
    ref.current.scale.set(scale, scale, scale);
    ref.current.material.opacity = 0.3 + 0.3 * Math.sin(t * 4);
  });
  return (
    <mesh ref={ref} position={[0, PACK_H * 0.85, 0]}>
      <sphereGeometry args={[0.05, 16, 16]} />
      <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={2} transparent opacity={0.6} />
    </mesh>
  );
}

/* ─── grid layout generator ─── */
function packGridPositions(count) {
  const positions = [];
  const colSpacing = FOOTPRINT * 0.95;
  const rowSpacing = FOOTPRINT * 1.05;
  const cols = Math.ceil(Math.sqrt(count * 1.5));

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const xOff = row % 2 === 1 ? colSpacing / 2 : 0;
    positions.push([
      col * colSpacing + xOff - ((cols - 1) * colSpacing) / 2,
      0,
      row * rowSpacing - ((Math.ceil(count / cols) - 1) * rowSpacing) / 2,
    ]);
  }
  return positions;
}

/* ─── reflective grid floor ─── */
function GridFloor() {
  const gridRef = useRef();
  useFrame(({ clock }) => {
    if (!gridRef.current) return;
    gridRef.current.material.opacity = 0.35 + 0.05 * Math.sin(clock.getElapsedTime() * 0.5);
  });

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.22, 0]}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#060a14" transparent opacity={0.7} metalness={0.9} roughness={0.2} />
      </mesh>
      <gridHelper
        ref={gridRef}
        args={[40, 40, new THREE.Color(0.06, 0.14, 0.25), new THREE.Color(0.04, 0.08, 0.16)]}
        position={[0, -0.21, 0]}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]}>
        <circleGeometry args={[3, 32]} />
        <meshBasicMaterial color="#4fc8f7" transparent opacity={0.03} />
      </mesh>
    </group>
  );
}

/* ─── scene ─── */
function FleetScene({ fleet, onZoom }) {
  const positions = useMemo(() => packGridPositions(fleet.length), [fleet.length]);

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[10, 15, 10]} intensity={0.7} />
      <directionalLight position={[-5, 8, -5]} intensity={0.3} color="#4fc8f7" />
      <pointLight position={[0, 6, 0]} intensity={0.4} color="#6366f1" />
      <pointLight position={[5, 3, 5]} intensity={0.2} color="#64dc78" />
      <pointLight position={[-5, 3, -5]} intensity={0.15} color="#4fc8f7" />

      <GridFloor />

      {fleet.map((v, i) => (
        <MiniPack key={v.vehicle_id} vehicle={v} position={positions[i] || [0, 0, 0]} onZoom={onZoom} />
      ))}

      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        minPolarAngle={0.3}
        maxPolarAngle={Math.PI / 2.2}
        minDistance={3}
        maxDistance={16}
        autoRotate
        autoRotateSpeed={0.25}
      />

      <EffectComposer>
        <Bloom intensity={0.55} luminanceThreshold={0.3} luminanceSmoothing={0.9} mipmapBlur />
      </EffectComposer>
    </>
  );
}

/* ─── exported component ─── */
export default function FleetGrid3D({ fleet, onVehicleClick }) {
  if (!fleet || fleet.length === 0) return null;

  return (
    <div className="fleet-3d-container">
      <Canvas camera={{ position: [0, 6, 8], fov: 50 }} dpr={[1, 2]} gl={{ antialias: true }}>
        <FleetScene fleet={fleet} onZoom={onVehicleClick} />
      </Canvas>
    </div>
  );
}
