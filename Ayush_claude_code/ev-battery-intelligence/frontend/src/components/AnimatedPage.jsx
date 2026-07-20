/**
 * AnimatedPage — framer-motion page transition wrapper.
 *
 * Wraps page content so it fades-in + slides-up on mount and
 * fades-out on unmount.  Children are staggered for a cascading reveal.
 */

import { motion } from "framer-motion";

const pageVariants = {
  initial: { opacity: 0, y: 24 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.45,
      ease: [0.25, 0.46, 0.45, 0.94],
      staggerChildren: 0.08,
    },
  },
  exit: {
    opacity: 0,
    y: -12,
    transition: { duration: 0.25, ease: "easeIn" },
  },
};

const childVariants = {
  initial: { opacity: 0, y: 16 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

export default function AnimatedPage({ children }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {children}
    </motion.div>
  );
}

/** Wrap individual panels / cards to get staggered reveal */
export function AnimatedChild({ children, className, style }) {
  return (
    <motion.div variants={childVariants} className={className} style={style}>
      {children}
    </motion.div>
  );
}
