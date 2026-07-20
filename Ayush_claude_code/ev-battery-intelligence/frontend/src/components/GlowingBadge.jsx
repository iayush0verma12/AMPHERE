/**
 * GlowingBadge — premium status badge with animated glow.
 *
 * CRITICAL badges pulse, all badges have a soft colored box-shadow
 * and a slowly rotating gradient border.
 */

export default function GlowingBadge({ status }) {
  const cls = `glowing-badge ${status}`;
  return <span className={cls}>{status}</span>;
}
