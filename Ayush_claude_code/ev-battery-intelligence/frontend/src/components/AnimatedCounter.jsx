/**
 * AnimatedCounter — smoothly animates numeric KPI values.
 *
 * When `value` changes, the displayed number counts up/down
 * to the new target over ~600ms using requestAnimationFrame.
 */

import { useEffect, useRef, useState } from "react";

const DURATION = 600; /* ms */

export default function AnimatedCounter({ value, decimals = 0, suffix = "" }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const rafRef = useRef(null);

  useEffect(() => {
    const from = prevRef.current;
    const to = typeof value === "number" ? value : parseFloat(value) || 0;
    prevRef.current = to;

    if (from === to) {
      setDisplay(to);
      return;
    }

    const start = performance.now();
    function tick(now) {
      const elapsed = now - start;
      const t = Math.min(elapsed / DURATION, 1);
      /* ease-out cubic */
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);

  const formatted =
    typeof display === "number" ? display.toFixed(decimals) : display;

  return (
    <span className="animated-counter">
      {formatted}
      {suffix}
    </span>
  );
}
