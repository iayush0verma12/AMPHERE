import { useState } from "react";
import { NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import FleetOverview from "./pages/FleetOverview.jsx";
import VehicleDetail from "./pages/VehicleDetail.jsx";
import AlertsPage from "./pages/AlertsPage.jsx";
import AIAgentPage from "./pages/AIAgentPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import ElectricBackground from "./components/ElectricBackground.jsx";

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return sessionStorage.getItem("auth") === "true";
  });

  if (!isLoggedIn) {
    return (
      <div className="app-shell">
        <ElectricBackground />
        <LoginPage onLogin={() => {
          sessionStorage.setItem("auth", "true");
          setIsLoggedIn(true);
          navigate("/");
        }} />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <ElectricBackground />
      <aside className="sidebar">
        <div className="brand-header">
          <span className="brand-icon">⚡</span>
          <div className="brand-title">EV Intelligence<br />System</div>
          <div className="brand-sub">Industrial Fleet · Asset AI</div>
        </div>
        
        <div className="user-profile">
          <div className="user-avatar">AD</div>
          <div className="user-info">
            <span className="user-name">Admin Session</span>
            <span className="user-role">Level 4 Access</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            <span className="nav-icon">⊞</span> Fleet Overview
          </NavLink>
          <NavLink to="/alerts" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            <span className="nav-icon">⚠</span> Alerts
          </NavLink>
          <NavLink to="/ai-agent" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            <span className="nav-icon">🤖</span> AI Agent
          </NavLink>
        </nav>
        
        <div className="sidebar-footer">
          <button 
            className="secondary logout-btn" 
            onClick={() => {
              sessionStorage.removeItem("auth");
              setIsLoggedIn(false);
            }}
          >
            Logout session
          </button>
          <div className="sidebar-version">v2.0 · AMPERE Engine</div>
        </div>
      </aside>
      <main className="main">
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<FleetOverview />} />
            <Route path="/vehicle/:id" element={<VehicleDetail />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/ai-agent" element={<AIAgentPage />} />
          </Routes>
        </AnimatePresence>
      </main>
    </div>
  );
}
