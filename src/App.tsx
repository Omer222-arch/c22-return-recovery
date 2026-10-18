import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import Overview from "./pages/Overview";
import Workbench from "./pages/Workbench";
import ScenarioLab from "./pages/ScenarioLab";
import DataCenter from "./pages/DataCenter";
import ProposalReview from "./pages/ProposalReview";
import CaseChecks from "./pages/CaseChecks";
import Business from "./pages/Business";
import PilotTracker from "./pages/PilotTracker";
import NotFound from "./pages/NotFound";
import ErrorPage from "./pages/ErrorPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Overview />} />
        <Route path="/workbench" element={<Workbench />} />
        <Route path="/scenario-lab" element={<ScenarioLab />} />
        <Route path="/data-center" element={<DataCenter />} />
        <Route path="/proposals" element={<ProposalReview />} />
        <Route path="/case-checks" element={<CaseChecks />} />
        <Route path="/business" element={<Business />} />
        <Route path="/pilot-tracker" element={<PilotTracker />} />
        <Route path="/error" element={<ErrorPage />} />
        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Route>
    </Routes>
  );
}