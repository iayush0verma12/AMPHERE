/**
 * TiltCard — glassmorphism card with 3D perspective tilt on mouse hover.
 *
 * Tracks mouse position inside the card and applies a subtle
 * perspective rotation + a moving light-shine overlay.  Pure CSS +
 * vanilla JS — no Three.js overhead for this effect.
 *
 * Now with electric spark particles on hover!
 */

import { useRef, useCallback, useState } from "react";

const MAX_TILT = 8; /* degrees */
const PERSPECTIVE = 800;

export default function TiltCard({ children, className = "", style = {} }) {
  const cardRef = useRef(null);
  const shineRef = useRef(null);
  const [sparks, setSparks] = useState([]);
  const sparkIdRef = useRef(0);

  const handleMove = useCallback((e) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    const rotateX = ((y - cy) / cy) * -MAX_TILT;
    const rotateY = ((x - cx) / cx) * MAX_TILT;

    el.style.transform = `perspective(${PERSPECTIVE}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02,1.02,1.02)`;

    if (shineRef.current) {
      shineRef.current.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(79, 200, 247, 0.12) 0%, rgba(100, 220, 120, 0.04) 30%, transparent 60%)`;
    }

    /* Spawn spark particles */
    if (Math.random() > 0.6) {
      const id = sparkIdRef.current++;
      const dx = (Math.random() - 0.5) * 60;
      const dy = (Math.random() - 0.5) * 60;
      const newSpark = { id, x, y, dx, dy };
      setSparks((prev) => [...prev.slice(-8), newSpark]);
      setTimeout(() => {
        setSparks((prev) => prev.filter((s) => s.id !== id));
      }, 600);
    }
  }, []);

  const handleLeave = useCallback(() => {
    const el = cardRef.current;
    if (el) el.style.transform = `perspective(${PERSPECTIVE}px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)`;
    if (shineRef.current) shineRef.current.style.background = "transparent";
    setSparks([]);
  }, []);

  return (
    <div
      ref={cardRef}
      className={`tilt-card ${className}`}
      style={style}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      <div ref={shineRef} className="tilt-card-shine" />
      <div className="tilt-spark-container">
        {sparks.map((s) => (
          <span
            key={s.id}
            className="tilt-spark"
            style={{
              left: s.x,
              top: s.y,
              "--spark-dx": `${s.dx}px`,
              "--spark-dy": `${s.dy}px`,
            }}
          />
        ))}
      </div>
      {children}
    </div>
  );
}
