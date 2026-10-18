import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function AppLayout() {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-column">
        <Topbar />
        <main className="page-content"><Outlet /></main>
        <footer className="app-footer">
          <span>ReCoverIQ · Risk-aware returned-stock recovery</span>
          <span>Scenario values are illustrative, not operational advice.</span>
        </footer>
      </div>
    </div>
  );
}