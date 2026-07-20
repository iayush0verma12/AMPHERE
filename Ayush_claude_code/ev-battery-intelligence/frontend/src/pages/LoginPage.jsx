import { useState } from "react";
import { motion } from "framer-motion";
import AnimatedPage from "../components/AnimatedPage.jsx";
import GlowingBadge from "../components/GlowingBadge.jsx";

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(false);
    setLoading(true);

    setTimeout(() => {
      // Demo credentials
      if (username.trim().toLowerCase() === "admin" && password.trim() === "ev2026") {
        onLogin();
      } else {
        setError(true);
        setLoading(false);
      }
    }, 800);
  };

  return (
    <AnimatedPage>
      <div className="login-page">
      <motion.div
        className="login-card"
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <div className="login-header">
          <motion.span
            className="brand-icon"
            style={{ fontSize: 42 }}
            animate={error ? { x: [-5, 5, -5, 5, 0], filter: "drop-shadow(0 0 12px rgba(239, 68, 68, 0.8))" } : {}}
            transition={{ duration: 0.4 }}
          >
            ⚡
          </motion.span>
          <div className="brand-title" style={{ fontSize: 24, marginTop: 12 }}>EV Intelligence</div>
          <div className="brand-sub">Secure Command Center</div>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-group">
            <label>Operator ID</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              autoComplete="username"
              className={error ? "error" : ""}
            />
          </div>
          
          <div className="input-group">
            <label>Security Key</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              autoComplete="current-password"
              className={error ? "error" : ""}
            />
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }} 
              animate={{ opacity: 1, height: "auto" }} 
              className="error-message"
            >
              Access Denied. Invalid credentials.
            </motion.div>
          )}

          <button type="submit" className="login-btn" disabled={loading || !username || !password}>
            {loading ? "Authenticating..." : "Initialize Session"}
          </button>
        </form>
        
        <div className="login-footer">
          <GlowingBadge status={"HEALTHY"} />
          <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Systems Nominal
          </span>
        </div>
      </motion.div>
      </div>
    </AnimatedPage>
  );
}
