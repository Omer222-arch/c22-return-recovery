import { NavLink } from "react-router-dom";
import {
  Activity, BarChart3, CheckCheck, CircleDollarSign,
  Database, FlaskConical, LayoutDashboard, PackageSearch, Route, ShieldCheck
} from "lucide-react";

const primaryLinks = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/workbench", label: "Recovery Workbench", icon: PackageSearch },
  { to: "/scenario-lab", label: "Scenario Lab", icon: FlaskConical },
  { to: "/data-center", label: "Data Center", icon: Database },
  { to: "/proposals", label: "Proposal Review", icon: CheckCheck }
];
const oversightLinks = [
  { to: "/case-checks", label: "Case Checks", icon: ShieldCheck },
  { to: "/business", label: "Business Impact", icon: CircleDollarSign },
  { to: "/pilot-tracker", label: "Pilot Tracker", icon: Activity }
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <NavLink to="/" className="brand">
        <span className="brand-mark"><Route size={21} /></span>
        <span><strong>ReCoverIQ</strong><small>Recovery intelligence</small></span>
      </NavLink>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="nav-list" aria-label="Main navigation">
        {primaryLinks.map(({ to, label, icon: Icon, ...rest }) => (
          <NavLink key={to} to={to} end={"end" in rest ? rest.end : false} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-label oversight-label">CONTROL & REPORTING</div>
      <nav className="nav-list" aria-label="Control and reporting">
        {oversightLinks.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-help-icon"><BarChart3 size={18} /></div>
        <div><strong>Recovery workspace</strong><p>Make every route count.</p></div>
      </div>
    </aside>
  );
}