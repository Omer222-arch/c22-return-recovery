
import { useState } from "react";
import DataCenter from "./pages/DataCenter";
import ProposalReview from "./pages/ProposalReview";
import Outcomes from "./pages/Outcomes";

type Page = "data" | "proposals" | "outcomes";

function App() {
  const [activePage, setActivePage] = useState<Page>("data");

  return (
    <>
      <nav className="app-navigation">
        <div className="app-brand">ReCoverIQ</div>

        <div className="app-nav-links">
          <button
            type="button"
            className={activePage === "data" ? "nav-link active" : "nav-link"}
            onClick={() => setActivePage("data")}
          >
            Data Center
          </button>

          <button
            type="button"
            className={
              activePage === "proposals" ? "nav-link active" : "nav-link"
            }
            onClick={() => setActivePage("proposals")}
          >
            Proposal Review
          </button>

          <button
            type="button"
            className={
              activePage === "outcomes" ? "nav-link active" : "nav-link"
            }
            onClick={() => setActivePage("outcomes")}
          >
            Outcomes
          </button>
        </div>
      </nav>

      {activePage === "data" && <DataCenter />}
      {activePage === "proposals" && <ProposalReview />}
      {activePage === "outcomes" && <Outcomes />}
    </>
  );
}

export default App;
