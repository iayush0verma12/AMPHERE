/**
 * Vehicle3DModel — JARVIS holographic wireframe vehicle templates.
 * 
 * Renders an abstract 3D vehicle representation built from Three.js
 * primitives to convey a "holographic command center" aesthetic.
 * No external .glb or .obj models are used to ensure performance.
 */

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  RoundedBox,
  Html,
  Edges,
  Cylinder
} from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";

const CYBER_BLUE = "#4fc8f7";

/* Vehicles here travel along Z, so a wheel's axle must run along X (left-right)
   for its circular face to present sideways, like a real rolling wheel — that
   means rotating the cylinder's default Y-axis onto X, i.e. around Z. */
function Wheel({ position, scale = 1 }) {
  return (
    <group position={position}>
      <Cylinder args={[0.3 * scale, 0.3 * scale, 0.2 * scale, 16]} rotation={[0, 0, Math.PI / 2]}>
        <meshBasicMaterial color={CYBER_BLUE} wireframe transparent opacity={0.15} />
      </Cylinder>
      <Cylinder args={[0.29 * scale, 0.29 * scale, 0.21 * scale, 16]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color="#050810" emissive={CYBER_BLUE} emissiveIntensity={0.2} transparent opacity={0.8} />
      </Cylinder>
    </group>
  );
}

const STATUS_MARKER_COLORS = {
  HEALTHY: "#64dc78",
  WARNING: "#f5a623",
  CRITICAL: "#ef4444",
};

function HologramChassis({ children, position, args, radius = 0.05 }) {
  return (
    <group position={position}>
      <RoundedBox args={args} radius={radius} smoothness={4}>
        <meshStandardMaterial
          color="#0a1628"
          transparent
          opacity={0.15}
          metalness={0.8}
          roughness={0.2}
          side={THREE.DoubleSide}
        />
        <Edges linewidth={1.5} threshold={15} color={CYBER_BLUE} />
      </RoundedBox>
      {children}
    </group>
  );
}

function BatteryMarker({ position, color = "#64dc78" }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.material.opacity = 0.3 + 0.3 * Math.sin(t * 3);
  });

  return (
    <group position={position}>
      <mesh ref={ref}>
        <boxGeometry args={[1.5, 0.2, 1.2]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <Html position={[0, -0.3, 0]} center>
        <div style={{ color, fontSize: "10px", fontFamily: "'Orbitron', sans-serif", letterSpacing: "0.1em", textShadow: `0 0 5px ${color}`, textTransform: "uppercase" }}>Battery Pack</div>
      </Html>
    </group>
  );
}

/* ─── Vehicle Models ─── */

function BusWireframe({ markerColor }) {
  return (
    <group position={[0, 0.6, 0]}>
      {/* Main Body */}
      <HologramChassis args={[1.8, 1.2, 4]} />
      {/* Batteries at bottom */}
      <BatteryMarker position={[0, -0.5, 0]} color={markerColor} />
      {/* Wheels */}
      <Wheel position={[-0.9, -0.6, 1.4]} />
      <Wheel position={[0.9, -0.6, 1.4]} />
      <Wheel position={[-0.9, -0.6, -1.4]} />
      <Wheel position={[0.9, -0.6, -1.4]} />
      {/* Annotations */}
      <Html position={[0, 1.0, 1.8]} center>
        <div className="hud-annotation">Front Axle</div>
      </Html>
    </group>
  );
}

function TruckWireframe({ markerColor }) {
  return (
    <group position={[0, 0.6, 0]}>
      {/* Cab */}
      <HologramChassis args={[1.6, 1.4, 1.2]} position={[0, 0.1, 1.0]} />
      {/* Flatbed / Cargo Area */}
      <HologramChassis args={[1.8, 0.2, 2.5]} position={[0, -0.2, -0.8]} />
      {/* Battery Pack Behind Cab */}
      <BatteryMarker position={[0, -0.1, -0.8]} color={markerColor} />
      {/* Wheels */}
      <Wheel position={[-0.9, -0.6, 1.2]} scale={1.2} />
      <Wheel position={[0.9, -0.6, 1.2]} scale={1.2} />
      <Wheel position={[-0.9, -0.6, -0.8]} scale={1.2} />
      <Wheel position={[0.9, -0.6, -0.8]} scale={1.2} />
      <Wheel position={[-0.9, -0.6, -1.6]} scale={1.2} />
      <Wheel position={[0.9, -0.6, -1.6]} scale={1.2} />
      <Html position={[0, 1.2, 1.0]} center>
        <div className="hud-annotation">Cab / Controls</div>
      </Html>
    </group>
  );
}

function LCVWireframe({ markerColor }) {
  return (
    <group position={[0, 0.5, 0]}>
      {/* Main Van Body */}
      <HologramChassis args={[1.4, 1.0, 3.2]} />
      {/* Battery */}
      <BatteryMarker position={[0, -0.4, 0]} color={markerColor} />
      {/* Wheels */}
      <Wheel position={[-0.7, -0.5, 1.0]} scale={0.9} />
      <Wheel position={[0.7, -0.5, 1.0]} scale={0.9} />
      <Wheel position={[-0.7, -0.5, -1.0]} scale={0.9} />
      <Wheel position={[0.7, -0.5, -1.0]} scale={0.9} />
      <Html position={[0, 0.8, -1.0]} center>
        <div className="hud-annotation">Cargo Bay</div>
      </Html>
    </group>
  );
}

function ForkliftWireframe({ markerColor }) {
  return (
    <group position={[0, 0.4, 0]}>
      {/* Main Body */}
      <HologramChassis args={[1.0, 0.8, 1.6]} position={[0, 0, -0.3]} />
      {/* Mast */}
      <HologramChassis args={[0.2, 1.8, 0.2]} position={[-0.3, 0.5, 0.6]} />
      <HologramChassis args={[0.2, 1.8, 0.2]} position={[0.3, 0.5, 0.6]} />
      {/* Forks */}
      <HologramChassis args={[0.6, 0.05, 1.0]} position={[0, -0.3, 1.2]} />
      {/* Battery Array */}
      <ReactBatteryMarker position={[0, -0.2, -0.3]} scale={[0.8, 1, 0.6]} color={markerColor} />
      {/* Wheels */}
      <Wheel position={[-0.5, -0.4, 0.3]} scale={0.7} />
      <Wheel position={[0.5, -0.4, 0.3]} scale={0.7} />
      <Wheel position={[-0.4, -0.4, -0.8]} scale={0.6} />
      <Wheel position={[0.4, -0.4, -0.8]} scale={0.6} />
      <Html position={[0, 1.5, 0.6]} center>
        <div className="hud-annotation">Lifting Mast</div>
      </Html>
    </group>
  );
}

function ReactBatteryMarker({ position, scale = [1, 1, 1], color = "#64dc78" }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.material.opacity = 0.3 + 0.3 * Math.sin(t * 3);
  });

  return (
    <group position={position}>
      <mesh ref={ref}>
        <boxGeometry args={[1.5 * scale[0], 0.2 * scale[1], 1.2 * scale[2]]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <Html position={[0, -0.3, 0]} center>
        <div style={{ color, fontSize: "10px", fontFamily: "'Orbitron', sans-serif", letterSpacing: "0.1em", textShadow: `0 0 5px ${color}`, textTransform: "uppercase" }}>Battery Pack</div>
      </Html>
    </group>
  );
}

/* ─── Scanning Laser ─── */
function ScanningLaser() {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.position.z = Math.sin(t * 0.5) * 2;
    ref.current.material.opacity = 0.15 + 0.1 * Math.sin(t * 5);
  });

  return (
    <mesh ref={ref} position={[0, 0, 0]}>
      <planeGeometry args={[4, 4]} />
      <meshBasicMaterial
        color={CYBER_BLUE}
        transparent
        opacity={0.2}
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

function GridFloor() {
  return (
    <gridHelper args={[20, 20, CYBER_BLUE, "#1e2d48"]} position={[0, -0.8, 0]} />
  );
}

export default function Vehicle3DModel({ modelName = "e-Bus 12M", status }) {
  const markerColor = STATUS_MARKER_COLORS[status] ?? STATUS_MARKER_COLORS.HEALTHY;

  const Model = () => {
    if (modelName.toLowerCase().includes("truck")) return <TruckWireframe markerColor={markerColor} />;
    if (modelName.toLowerCase().includes("bus")) return <BusWireframe markerColor={markerColor} />;
    if (modelName.toLowerCase().includes("forklift")) return <ForkliftWireframe markerColor={markerColor} />;
    return <LCVWireframe markerColor={markerColor} />;
  };

  return (
    <div className="vehicle-3d-hero">
      <Canvas camera={{ position: [4, 2, 5], fov: 45 }} dpr={[1, 2]} gl={{ antialias: true }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 10, 5]} intensity={0.5} />
        <pointLight position={[-3, 2, 0]} intensity={0.5} color={CYBER_BLUE} />
        
        <group rotation={[0, Math.PI / 6, 0]}>
          <Model />
          <GridFloor />
          <ScanningLaser />
        </group>

        <OrbitControls enablePan={false} enableZoom={true} minDistance={3} maxDistance={12} autoRotate autoRotateSpeed={0.5} />
        
        <EffectComposer>
          <Bloom
            intensity={0.8}
            luminanceThreshold={0.2}
            luminanceSmoothing={0.9}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
