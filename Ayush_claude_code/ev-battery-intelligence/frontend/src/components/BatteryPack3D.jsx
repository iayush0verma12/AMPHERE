/**
 * BatteryPack3D — interactive Three.js 3D battery pack digital twin.
 *
 * Renders 12 prismatic cells in a 3×4 grid inside a translucent casing.
 * Iron Man–inspired holographic depth: cells are translucent with internal
 * energy bars, visible electrode layers, a scanning laser overlay, and
 * a wireframe casing for the see-through effect.
 */

import { useRef, useMemo, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  RoundedBox,
  Html,
  Edges,
} from "@react-three/drei";
import {
  EffectComposer,
  Bloom,
} from "@react-three/postprocessing";
import * as THREE from "three";

/* ─── constants ─── */
const CELL_W = 0.85;
const CELL_H = 1.5;
const CELL_D = 0.55;
const GAP = 0.15;
const COLS = 4;
const ROWS = 3;
const UNDERVOLT = 2.8;
const NOMINAL = 3.7;
const OVERVOLT = 4.25;

/* Overall vehicle status is the primary color signal — it's what the fleet
   overview already colors each pack by, so the detail view must agree with
   it rather than let per-cell voltage (a secondary signal) contradict it. */
const STATUS_COLORS = {
  HEALTHY: new THREE.Color(0.13, 0.77, 0.37),
  WARNING: new THREE.Color(0.96, 0.62, 0.04),
  CRITICAL: new THREE.Color(0.94, 0.27, 0.27),
};

/* ─── helpers ─── */
function voltageColor(v) {
  if (v === 0) return new THREE.Color(0.15, 0.15, 0.2); /* dropout */
  if (v < UNDERVOLT) return new THREE.Color(0.6, 0.1, 0.1);
  if (v > OVERVOLT) return new THREE.Color(0.95, 0.15, 0.1);
  const t = (v - UNDERVOLT) / (OVERVOLT - UNDERVOLT);
  if (t < 0.6) return new THREE.Color(0.15, 0.75, 0.35);
  if (t < 0.8) return new THREE.Color(0.85, 0.7, 0.15);
  return new THREE.Color(0.95, 0.3, 0.1);
}

function tempEmissive(packTemp) {
  if (packTemp < 35) return new THREE.Color(0, 0, 0);
  if (packTemp < 50) {
    const t = (packTemp - 35) / 15;
    return new THREE.Color(t * 0.2, t * 0.08, 0);
  }
  if (packTemp < 65) {
    const t = (packTemp - 50) / 15;
    return new THREE.Color(0.2 + t * 0.6, 0.08 + t * 0.15, 0);
  }
  return new THREE.Color(0.9, 0.25, 0.05);
}

/* Voltage to SOC-like 0–1 fill level */
function voltageFill(v) {
  if (v === 0) return 0;
  return Math.max(0, Math.min(1, (v - UNDERVOLT) / (OVERVOLT - UNDERVOLT)));
}

/* ─── Internal energy bar (liquid level meter inside cell) ─── */
function EnergyBar({ voltage, col, row, statusColor }) {
  const ref = useRef();
  const fill = voltageFill(voltage);
  const xOffset = (col - (COLS - 1) / 2) * (CELL_W + GAP);
  const yOffset = (row - (ROWS - 1) / 2) * (CELL_H + GAP);

  const barH = CELL_H * 0.75 * fill;
  const barY = -(CELL_H * 0.75) / 2 + barH / 2;

  const color = useMemo(() => statusColor ?? voltageColor(voltage), [voltage, statusColor]);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.material.emissiveIntensity = 0.3 + 0.15 * Math.sin(t * 2 + col + row);
  });

  if (fill <= 0) return null;

  return (
    <mesh ref={ref} position={[xOffset, yOffset + barY, 0]}>
      <boxGeometry args={[CELL_W * 0.7, barH, CELL_D * 0.5]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.3}
        transparent
        opacity={0.45}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

/* ─── Electrode layers inside cell ─── */
function ElectrodeLayers({ col, row }) {
  const xOffset = (col - (COLS - 1) / 2) * (CELL_W + GAP);
  const yOffset = (row - (ROWS - 1) / 2) * (CELL_H + GAP);
  const layers = 4;

  return (
    <group position={[xOffset, yOffset, 0]}>
      {Array.from({ length: layers }, (_, i) => {
        const z = (i / (layers - 1) - 0.5) * (CELL_D * 0.6);
        return (
          <mesh key={i} position={[0, 0, z]}>
            <planeGeometry args={[CELL_W * 0.8, CELL_H * 0.85]} />
            <meshBasicMaterial
              color="#4fc8f7"
              transparent
              opacity={0.03}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </group>
  );
}

/* ─── Cell mesh ─── */
function CellMesh({ index, voltage, packTemp, faultType, col, row, statusColor }) {
  const meshRef = useRef();
  const [hovered, setHovered] = useState(false);

  const xOffset = (col - (COLS - 1) / 2) * (CELL_W + GAP);
  const yOffset = (row - (ROWS - 1) / 2) * (CELL_H + GAP);

  const baseColor = useMemo(() => statusColor ?? voltageColor(voltage), [voltage, statusColor]);
  const emissive = useMemo(() => tempEmissive(packTemp), [packTemp]);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    const mat = meshRef.current.material;

    /* Fault-specific animations */
    if (faultType === "THERMAL_EVENT") {
      const pulse = 0.5 + 0.5 * Math.sin(t * 4 + index);
      mat.emissiveIntensity = 0.8 + pulse * 1.2;
      mat.emissive.set(0.9, 0.3 + pulse * 0.2, 0.05);
    } else if (faultType === "CELL_IMBALANCE" && voltage < NOMINAL - 0.05) {
      const pulse = 0.7 + 0.3 * Math.sin(t * 3);
      meshRef.current.scale.y = pulse;
      mat.emissive.set(0.7, 0.5, 0.05);
      mat.emissiveIntensity = 0.6;
    } else if (faultType === "SENSOR_DROPOUT" && voltage === 0) {
      const flicker = Math.random() > 0.92 ? 0.4 : 0.05;
      mat.emissiveIntensity = flicker;
      mat.emissive.set(0.2, 0.2, 0.3);
    } else if (faultType === "OVERVOLTAGE") {
      const pulse = 0.5 + 0.5 * Math.sin(t * 5 + index * 0.5);
      mat.emissive.set(0.95, 0.1, 0.1);
      mat.emissiveIntensity = 0.5 + pulse;
    } else if (faultType === "UNDERVOLTAGE") {
      const dim = 0.2 + 0.1 * Math.sin(t * 2);
      mat.emissiveIntensity = dim;
      mat.opacity = 0.3 + 0.15 * Math.sin(t * 1.5);
    } else {
      mat.emissive.copy(emissive);
      mat.emissiveIntensity = packTemp > 35 ? 0.4 : 0.12;
      meshRef.current.scale.y = 1;
      mat.opacity = 0.55;
    }
  });

  return (
    <group position={[xOffset, yOffset, 0]}>
      <RoundedBox
        ref={meshRef}
        args={[CELL_W, CELL_H, CELL_D]}
        radius={0.015}
        smoothness={2}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={() => setHovered(false)}
      >
        <meshStandardMaterial
          color="#0a1020"
          emissive={emissive}
          emissiveIntensity={0.15}
          metalness={0.7}
          roughness={0.15}
          transparent
          opacity={0.55}
        />
        <Edges linewidth={1.5} threshold={15} color={baseColor} />
      </RoundedBox>
      {/* Cell label */}
      <Html
        position={[0, -CELL_H / 2 - 0.18, 0]}
        center
        style={{ pointerEvents: "none" }}
      >
        <div style={{
          color: "#8a9bb8",
          fontSize: 9,
          fontFamily: "'Orbitron', 'Inter', sans-serif",
          whiteSpace: "nowrap",
          textAlign: "center",
          letterSpacing: "0.08em",
        }}>
          C{index + 1}
        </div>
      </Html>
      {/* Hover tooltip */}
      {hovered && (
        <Html position={[0, CELL_H / 2 + 0.3, 0]} center>
          <div className="cell-tooltip">
            <strong>Cell {index + 1}</strong>
            <br />
            {voltage === 0 ? "DROPOUT" : `${voltage.toFixed(3)} V`}
            <br />
            <span style={{ fontSize: 10, opacity: 0.7 }}>
              Fill: {(voltageFill(voltage) * 100).toFixed(0)}%
            </span>
          </div>
        </Html>
      )}
    </group>
  );
}

/* ─── Pack casing (wireframe + translucent shell) ─── */
function PackCasing() {
  const casingW = COLS * (CELL_W + GAP) + GAP + 0.25;
  const casingH = ROWS * (CELL_H + GAP) + GAP + 0.25;
  const casingD = CELL_D + 0.3;

  return (
    <group>
      {/* Translucent shell */}
      <RoundedBox args={[casingW, casingH, casingD]} radius={0.08} smoothness={4}>
        <meshStandardMaterial
          color="#0a1628"
          transparent
          opacity={0.1}
          metalness={0.7}
          roughness={0.2}
          side={THREE.DoubleSide}
        />
      </RoundedBox>
      {/* Wireframe overlay for holographic look */}
      <RoundedBox args={[casingW, casingH, casingD]} radius={0.08} smoothness={4}>
        <meshBasicMaterial
          color="#4fc8f7"
          wireframe
          transparent
          opacity={0.08}
        />
      </RoundedBox>
    </group>
  );
}

/* ─── Scanning laser line ─── */
function ScanningLaser() {
  const ref = useRef();
  const casingH = ROWS * (CELL_H + GAP) + GAP + 0.25;
  const casingW = COLS * (CELL_W + GAP) + GAP + 0.25;

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    const yRange = casingH * 0.9;
    const y = Math.sin(t * 0.7) * yRange / 2;
    ref.current.position.y = y;
    ref.current.material.opacity = 0.12 + 0.05 * Math.sin(t * 3);
  });

  return (
    <mesh ref={ref} position={[0, 0, CELL_D / 2 + 0.2]}>
      <planeGeometry args={[casingW * 1.1, 0.02]} />
      <meshBasicMaterial
        color="#4fc8f7"
        transparent
        opacity={0.15}
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

/* ─── HUD grid overlay ─── */
function HUDGrid() {
  const ref = useRef();

  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.material.opacity = 0.04 + 0.02 * Math.sin(clock.getElapsedTime() * 0.8);
  });

  return (
    <mesh ref={ref} position={[0, 0, CELL_D / 2 + 0.15]}>
      <planeGeometry args={[4, 4]} />
      <meshBasicMaterial
        color="#4fc8f7"
        wireframe
        transparent
        opacity={0.04}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

/* ─── Heat particles (shown during thermal events) ─── */
function HeatParticles({ active }) {
  const ref = useRef();
  const count = 80;

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 2.5;
      arr[i * 3 + 1] = Math.random() * 2;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
    }
    return arr;
  }, []);

  useFrame((_, delta) => {
    if (!ref.current || !active) return;
    const arr = ref.current.geometry.attributes.position.array;
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] += delta * (1 + Math.random());
      if (arr[i * 3 + 1] > 3) {
        arr[i * 3 + 1] = -0.5;
        arr[i * 3] = (Math.random() - 0.5) * 2.5;
      }
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  if (!active) return null;
  return (
    <points ref={ref} position={[0, 0, 0.3]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={count} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={3}
        color="#ff6a00"
        transparent
        opacity={0.6}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* ─── Warning ring (overvoltage / undervoltage) ─── */
function WarningRing({ active, color }) {
  const ref = useRef();

  useFrame(({ clock }) => {
    if (!ref.current || !active) return;
    const t = clock.getElapsedTime();
    const scale = 1 + 0.3 * Math.sin(t * 3);
    ref.current.scale.set(scale, scale, 1);
    ref.current.material.opacity = 0.3 + 0.2 * Math.sin(t * 3);
  });

  if (!active) return null;
  return (
    <mesh ref={ref} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.3]}>
      <torusGeometry args={[1.8, 0.03, 8, 48]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.4}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

/* ─── Scene ─── */
function BatteryScene({ cellVoltages, packTemp, faults, status }) {
  const safeFaults = Array.isArray(faults) ? faults : [];
  const faultType = safeFaults.length > 0 ? safeFaults[0].type : null;
  const statusColor = STATUS_COLORS[status] ?? null;

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={0.7} />
      <directionalLight position={[-3, -2, 4]} intensity={0.3} color="#4fc8f7" />
      <pointLight position={[0, 0, 3]} intensity={0.2} color="#64dc78" />

      <group rotation={[0.15, 0.3, 0]}>
        <PackCasing />

        {/* Electrode layers inside cells */}
        {cellVoltages.map((v, i) => {
          const col = i % COLS;
          const row = Math.floor(i / COLS);
          return <ElectrodeLayers key={`el-${i}`} col={col} row={row} />;
        })}

        {/* Energy bars (liquid level) inside cells */}
        {cellVoltages.map((v, i) => {
          const col = i % COLS;
          const row = Math.floor(i / COLS);
          return <EnergyBar key={`eb-${i}`} voltage={v} col={col} row={row} statusColor={statusColor} />;
        })}

        {/* Cell meshes */}
        {cellVoltages.map((v, i) => {
          const col = i % COLS;
          const row = Math.floor(i / COLS);
          return (
            <CellMesh
              key={i}
              index={i}
              voltage={v}
              packTemp={packTemp}
              faultType={faultType}
              col={col}
              row={row}
              statusColor={statusColor}
            />
          );
        })}

        <ScanningLaser />
        <HUDGrid />
        <HeatParticles active={faultType === "THERMAL_EVENT"} />
        <WarningRing active={faultType === "OVERVOLTAGE"} color="#ef4444" />
        <WarningRing active={faultType === "UNDERVOLTAGE"} color="#6366f1" />
      </group>

      <OrbitControls
        enablePan={false}
        enableZoom={true}
        minDistance={3}
        maxDistance={10}
        autoRotate
        autoRotateSpeed={0.5}
      />

      <EffectComposer>
        <Bloom
          intensity={0.7}
          luminanceThreshold={0.25}
          luminanceSmoothing={0.9}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
}

/* ─── Exported component ─── */
export default function BatteryPack3D({ cellVoltages = [], packTemp = 30, faults = [], status }) {
  /* fallback for missing data */
  const cells = cellVoltages.length === 12
    ? cellVoltages
    : Array(12).fill(NOMINAL);

  return (
    <div className="battery-3d-container">
      <Canvas
        camera={{ position: [0, 0, 5.5], fov: 45 }}
        dpr={[1, 2]}
        gl={{ antialias: true }}
      >
        <BatteryScene cellVoltages={cells} packTemp={packTemp} faults={faults} status={status} />
      </Canvas>
    </div>
  );
}
