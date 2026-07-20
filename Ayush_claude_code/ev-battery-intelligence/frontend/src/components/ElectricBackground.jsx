/**
 * ElectricBackground — immersive mouse-reactive electric current canvas.
 *
 * Renders branching lightning arcs, energy nodes, and flowing particles
 * that react to mouse movement. Inspired by Black Adam electricity +
 * Tesla coil aesthetics. Uses 2D Canvas (not WebGL) to avoid conflicts
 * with Three.js contexts used in the 3D views.
 */

import { useRef, useEffect, useCallback } from "react";

/* ─── Configuration ─── */
const PARTICLE_COUNT = 90;
const NODE_COUNT = 18;
const ARC_COUNT = 6;
const MOUSE_INFLUENCE = 180;

/* Electric color palette */
const COLORS = {
  primary: { r: 79, g: 200, b: 247 },    /* cyan-blue */
  secondary: { r: 100, g: 220, b: 120 },  /* green energy */
  accent: { r: 140, g: 120, b: 255 },     /* purple */
  hot: { r: 255, g: 180, b: 60 },         /* amber spark */
};

function lerp(a, b, t) { return a + (b - a) * t; }
function rand(min, max) { return min + Math.random() * (max - min); }

export default function ElectricBackground() {
  const canvasRef = useRef(null);
  const mouseRef = useRef({ x: -9999, y: -9999, active: false });
  const stateRef = useRef(null);

  const handleMouseMove = useCallback((e) => {
    mouseRef.current.x = e.clientX;
    mouseRef.current.y = e.clientY;
    mouseRef.current.active = true;
  }, []);

  const handleMouseLeave = useCallback(() => {
    mouseRef.current.active = false;
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [handleMouseMove, handleMouseLeave]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;
    let width, height;

    function resize() {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    /* ─── Initialize particles ─── */
    const particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        size: 0.8 + Math.random() * 2.5,
        alpha: 0.08 + Math.random() * 0.2,
        depth: Math.random(),            /* 0 = far, 1 = near */
        pulsePhase: Math.random() * Math.PI * 2,
        colorIdx: Math.floor(Math.random() * 3),
      });
    }

    /* ─── Initialize energy nodes ─── */
    const nodes = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      nodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        baseRadius: 2 + Math.random() * 4,
        pulsePhase: Math.random() * Math.PI * 2,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        intensity: 0.3 + Math.random() * 0.7,
      });
    }

    /* ─── Lightning arc state ─── */
    const arcs = [];
    function generateArc() {
      const startNode = nodes[Math.floor(Math.random() * nodes.length)];
      const endNode = nodes[Math.floor(Math.random() * nodes.length)];
      if (startNode === endNode) return null;
      return {
        x1: startNode.x, y1: startNode.y,
        x2: endNode.x, y2: endNode.y,
        life: 0,
        maxLife: 20 + Math.random() * 30,
        segments: 8 + Math.floor(Math.random() * 12),
        thickness: 0.5 + Math.random() * 1.5,
        colorKey: Math.random() > 0.5 ? "primary" : "secondary",
      };
    }

    /* ─── Draw a jagged lightning bolt between two points ─── */
    function drawLightning(ctx, x1, y1, x2, y2, segments, thickness, alpha, color) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      const displacement = len * 0.15;

      const points = [{ x: x1, y: y1 }];
      for (let i = 1; i < segments; i++) {
        const t = i / segments;
        const mx = x1 + dx * t + (Math.random() - 0.5) * displacement;
        const my = y1 + dy * t + (Math.random() - 0.5) * displacement;
        points.push({ x: mx, y: my });
      }
      points.push({ x: x2, y: y2 });

      /* Main bolt */
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
      ctx.lineWidth = thickness;
      ctx.shadowColor = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha * 0.8})`;
      ctx.shadowBlur = 12;
      ctx.stroke();

      /* Glow layer */
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha * 0.3})`;
      ctx.lineWidth = thickness * 4;
      ctx.shadowBlur = 25;
      ctx.stroke();

      ctx.shadowBlur = 0;

      /* Tiny branches */
      if (Math.random() > 0.6) {
        const branchIdx = 1 + Math.floor(Math.random() * (points.length - 2));
        const bx = points[branchIdx].x;
        const by = points[branchIdx].y;
        const bex = bx + (Math.random() - 0.5) * displacement * 1.5;
        const bey = by + (Math.random() - 0.5) * displacement * 1.5;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bex, bey);
        ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha * 0.5})`;
        ctx.lineWidth = thickness * 0.5;
        ctx.stroke();
      }
    }

    /* ─── Main render loop ─── */
    let frameCount = 0;

    function draw() {
      frameCount++;
      const time = frameCount * 0.016;
      const mouse = mouseRef.current;

      ctx.clearRect(0, 0, width, height);

      /* ─── Draw energy nodes ─── */
      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;
        if (node.x < 0 || node.x > width) node.vx *= -1;
        if (node.y < 0 || node.y > height) node.vy *= -1;

        /* Mouse attraction */
        if (mouse.active) {
          const dx = mouse.x - node.x;
          const dy = mouse.y - node.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < MOUSE_INFLUENCE * 2) {
            const force = 0.15 * (1 - dist / (MOUSE_INFLUENCE * 2));
            node.vx += (dx / dist) * force;
            node.vy += (dy / dist) * force;
          }
        }

        /* Dampen velocities */
        node.vx *= 0.99;
        node.vy *= 0.99;

        const pulse = 0.6 + 0.4 * Math.sin(time * 2 + node.pulsePhase);
        const r = node.baseRadius * pulse;

        /* Outer glow */
        const grad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, r * 6);
        grad.addColorStop(0, `rgba(79, 200, 247, ${0.15 * node.intensity * pulse})`);
        grad.addColorStop(0.5, `rgba(100, 220, 120, ${0.05 * node.intensity})`);
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.fillRect(node.x - r * 6, node.y - r * 6, r * 12, r * 12);

        /* Core dot */
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180, 240, 255, ${0.6 * node.intensity * pulse})`;
        ctx.fill();
      }

      /* ─── Draw connection lines between nearby nodes ─── */
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 250) {
            const alpha = 0.08 * (1 - dist / 250);
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(79, 200, 247, ${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      /* ─── Draw particles ─── */
      const colorKeys = [COLORS.primary, COLORS.secondary, COLORS.accent];
      for (const p of particles) {
        /* Mouse influence on particles */
        if (mouse.active) {
          const dx = mouse.x - p.x;
          const dy = mouse.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < MOUSE_INFLUENCE) {
            const force = 0.5 * (1 - dist / MOUSE_INFLUENCE) * p.depth;
            p.vx += (dx / dist) * force;
            p.vy += (dy / dist) * force;
          }
        }

        p.x += p.vx * (0.5 + p.depth * 0.8);
        p.y += p.vy * (0.5 + p.depth * 0.8);
        p.vx *= 0.98;
        p.vy *= 0.98;

        /* Add slight drift */
        p.vx += (Math.random() - 0.5) * 0.02;
        p.vy += (Math.random() - 0.5) * 0.02;

        /* Wrap */
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;
        if (p.y < -10) p.y = height + 10;
        if (p.y > height + 10) p.y = -10;

        const pulse = 0.7 + 0.3 * Math.sin(time * 1.5 + p.pulsePhase);
        const c = colorKeys[p.colorIdx];
        const sz = p.size * (0.5 + p.depth * 0.5) * pulse;
        const al = p.alpha * (0.3 + p.depth * 0.7) * pulse;

        ctx.beginPath();
        ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${al})`;
        ctx.fill();
      }

      /* ─── Lightning arcs ─── */
      /* Spawn new arcs occasionally */
      if (frameCount % 30 === 0 && arcs.length < ARC_COUNT) {
        const arc = generateArc();
        if (arc) arcs.push(arc);
      }

      /* Mouse-triggered arcs */
      if (mouse.active && frameCount % 12 === 0) {
        const nearestNode = nodes.reduce((closest, n) => {
          const d = Math.hypot(n.x - mouse.x, n.y - mouse.y);
          return d < closest.d ? { node: n, d } : closest;
        }, { node: null, d: Infinity });

        if (nearestNode.node && nearestNode.d < 400) {
          arcs.push({
            x1: mouse.x + (Math.random() - 0.5) * 20,
            y1: mouse.y + (Math.random() - 0.5) * 20,
            x2: nearestNode.node.x,
            y2: nearestNode.node.y,
            life: 0,
            maxLife: 10 + Math.random() * 15,
            segments: 6 + Math.floor(Math.random() * 8),
            thickness: 0.8 + Math.random() * 1.2,
            colorKey: Math.random() > 0.3 ? "primary" : "hot",
          });
        }
      }

      /* Draw and age arcs */
      for (let i = arcs.length - 1; i >= 0; i--) {
        const arc = arcs[i];
        arc.life++;
        if (arc.life > arc.maxLife) {
          arcs.splice(i, 1);
          continue;
        }

        const fadeIn = Math.min(arc.life / 3, 1);
        const fadeOut = 1 - (arc.life / arc.maxLife);
        const alpha = fadeIn * fadeOut * 0.7;
        const color = COLORS[arc.colorKey];

        drawLightning(ctx, arc.x1, arc.y1, arc.x2, arc.y2,
          arc.segments, arc.thickness, alpha, color);
      }

      /* ─── Mouse glow aura ─── */
      if (mouse.active) {
        const auraGrad = ctx.createRadialGradient(
          mouse.x, mouse.y, 0, mouse.x, mouse.y, MOUSE_INFLUENCE
        );
        auraGrad.addColorStop(0, "rgba(79, 200, 247, 0.06)");
        auraGrad.addColorStop(0.4, "rgba(100, 220, 120, 0.03)");
        auraGrad.addColorStop(1, "transparent");
        ctx.fillStyle = auraGrad;
        ctx.fillRect(
          mouse.x - MOUSE_INFLUENCE, mouse.y - MOUSE_INFLUENCE,
          MOUSE_INFLUENCE * 2, MOUSE_INFLUENCE * 2
        );
      }

      raf = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="particle-bg" />;
}
