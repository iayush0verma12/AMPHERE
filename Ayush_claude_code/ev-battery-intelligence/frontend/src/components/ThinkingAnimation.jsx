/**
 * ThinkingAnimation — AI reasoning visualization with central thunderbolt.
 *
 * Features a dramatic central lightning bolt that pulses and branches,
 * flanked by circuit nodes with flowing current. Professional and cinematic.
 */

import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const THINKING_MESSAGES = ["AMPERE agent working..."];

export default function ThinkingAnimation() {
  const canvasRef = useRef(null);
  const [messageIdx, setMessageIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setMessageIdx((i) => (i + 1) % THINKING_MESSAGES.length);
    }, 2200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;

    const cw = (canvas.width = canvas.parentElement.offsetWidth);
    const ch = (canvas.height = 180);
    const cx = cw / 2;
    const cy = ch / 2;

    let frame = 0;

    /* Generate a jagged lightning bolt path */
    function makeBolt(x1, y1, x2, y2, segments, jitter) {
      const points = [{ x: x1, y: y1 }];
      const dx = x2 - x1;
      const dy = y2 - y1;
      for (let i = 1; i < segments; i++) {
        const t = i / segments;
        points.push({
          x: x1 + dx * t + (Math.random() - 0.5) * jitter,
          y: y1 + dy * t + (Math.random() - 0.5) * jitter * 0.4,
        });
      }
      points.push({ x: x2, y: y2 });
      return points;
    }

    /* Draw a glowing bolt path */
    function drawBolt(points, color, width, alpha) {
      if (points.length < 2) return;

      /* Outer glow */
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.strokeStyle = `rgba(${color}, ${alpha * 0.25})`;
      ctx.lineWidth = width * 6;
      ctx.shadowColor = `rgba(${color}, ${alpha * 0.5})`;
      ctx.shadowBlur = 30;
      ctx.stroke();

      /* Mid glow */
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.strokeStyle = `rgba(${color}, ${alpha * 0.5})`;
      ctx.lineWidth = width * 3;
      ctx.shadowBlur = 15;
      ctx.stroke();

      /* Core */
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
      ctx.lineWidth = width;
      ctx.shadowBlur = 8;
      ctx.shadowColor = `rgba(${color}, ${alpha})`;
      ctx.stroke();

      ctx.shadowBlur = 0;
    }

    /* Side circuit nodes — above/below the horizontal bolt */
    const topNodes = [];
    const bottomNodes = [];
    for (let i = 0; i < 6; i++) {
      topNodes.push({
        x: 20 + (i / 5) * (cw - 40),
        y: 20 + Math.random() * (cy - 45),
        r: 2 + Math.random() * 2.5,
        phase: Math.random() * Math.PI * 2,
      });
      bottomNodes.push({
        x: 20 + (i / 5) * (cw - 40),
        y: cy + 25 + Math.random() * (cy - 45),
        r: 2 + Math.random() * 2.5,
        phase: Math.random() * Math.PI * 2,
      });
    }

    /* Flowing pulses along connections */
    const pulses = [];

    function draw() {
      frame++;
      const t = frame * 0.016;
      ctx.clearRect(0, 0, cw, ch);

      /* ─── CENTRAL THUNDERBOLT ─── */
      /* Main bolt: left-center to right-center (horizontal) */
      if (frame % 4 === 0) {
        const mainBolt = makeBolt(5, cy, cw - 5, cy, 12, 40);
        drawBolt(mainBolt, "79, 200, 247", 2, 0.8 + 0.2 * Math.sin(t * 3));

        /* Branch bolts from random points on main bolt */
        for (let i = 0; i < 3; i++) {
          const srcIdx = 2 + Math.floor(Math.random() * (mainBolt.length - 4));
          const src = mainBolt[srcIdx];
          const side = Math.random() > 0.5 ? 1 : -1;
          const branchEnd = {
            x: src.x + (Math.random() - 0.5) * 30,
            y: src.y + side * (20 + Math.random() * 40),
          };
          const branch = makeBolt(src.x, src.y, branchEnd.x, branchEnd.y, 4, 15);
          drawBolt(branch, "100, 220, 120", 1, 0.4 + 0.2 * Math.sin(t * 5 + i));
        }
      }

      /* Persistent glow line across center */
      const glowPulse = 0.15 + 0.1 * Math.sin(t * 2);
      const grad = ctx.createLinearGradient(0, cy, cw, cy);
      grad.addColorStop(0, "transparent");
      grad.addColorStop(0.3, `rgba(79, 200, 247, ${glowPulse})`);
      grad.addColorStop(0.5, `rgba(100, 220, 120, ${glowPulse * 1.2})`);
      grad.addColorStop(0.7, `rgba(79, 200, 247, ${glowPulse})`);
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.fillRect(0, cy - 3, cw, 6);

      /* ─── CIRCUIT NODES (above/below) ─── */
      const allNodes = [...topNodes, ...bottomNodes];
      for (const node of allNodes) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 2 + node.phase);
        const r = node.r * (0.8 + 0.2 * pulse);

        /* Glow */
        const g = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, r * 5);
        g.addColorStop(0, `rgba(79, 200, 247, ${0.2 * pulse})`);
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.fillRect(node.x - r * 5, node.y - r * 5, r * 10, r * 10);

        /* Core */
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(150, 230, 255, ${0.5 + 0.5 * pulse})`;
        ctx.fill();
      }

      /* ─── CONNECTIONS from nodes to center bolt ─── */
      for (const node of allNodes) {
        const alpha = 0.04 + 0.03 * Math.sin(t * 1.5 + node.phase);
        ctx.beginPath();
        ctx.moveTo(node.x, node.y);
        ctx.lineTo(node.x + (Math.random() - 0.5) * 20, cy);
        ctx.strokeStyle = `rgba(79, 200, 247, ${alpha})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      /* ─── FLOWING PULSES along connections ─── */
      if (frame % 10 === 0 && pulses.length < 12) {
        const node = allNodes[Math.floor(Math.random() * allNodes.length)];
        pulses.push({
          x: node.x,
          y: node.y,
          tx: node.x + (Math.random() - 0.5) * 10,
          ty: cy,
          t: 0,
          speed: 0.015 + Math.random() * 0.02,
          size: 2 + Math.random() * 2,
        });
      }

      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        p.t += p.speed;
        if (p.t > 1) { pulses.splice(i, 1); continue; }

        const px = p.x + (p.tx - p.x) * p.t;
        const py = p.y + (p.ty - p.y) * p.t;
        const fadeAlpha = p.t < 0.1 ? p.t * 10 : p.t > 0.8 ? (1 - p.t) * 5 : 1;

        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(100, 255, 200, ${0.7 * fadeAlpha})`;
        ctx.shadowColor = "rgba(100, 255, 200, 0.6)";
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      /* ─── ENERGY ORB at center ─── */
      const orbR = 6 + 2 * Math.sin(t * 3);
      const orbGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, orbR * 4);
      orbGrad.addColorStop(0, `rgba(255, 255, 255, ${0.4 + 0.2 * Math.sin(t * 4)})`);
      orbGrad.addColorStop(0.3, `rgba(79, 200, 247, 0.3)`);
      orbGrad.addColorStop(0.6, `rgba(100, 220, 120, 0.1)`);
      orbGrad.addColorStop(1, "transparent");
      ctx.fillStyle = orbGrad;
      ctx.fillRect(cx - orbR * 4, cy - orbR * 4, orbR * 8, orbR * 8);

      ctx.beginPath();
      ctx.arc(cx, cy, orbR, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 250, 255, ${0.6 + 0.3 * Math.sin(t * 4)})`;
      ctx.fill();

      raf = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="thinking-animation">
      <canvas ref={canvasRef} className="thinking-canvas" />
      <div className="thinking-overlay">
        <div className="thinking-spinner" />
        <AnimatePresence mode="wait">
          <motion.span
            key={messageIdx}
            className="thinking-text"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
          >
            {THINKING_MESSAGES[messageIdx]}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}
