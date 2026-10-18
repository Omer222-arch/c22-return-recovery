// Route definitions are maintained in src/App.tsx using React Router.
export const appRoutes = [
  { path: "/", label: "Overview" },
  { path: "/workbench", label: "Recovery Workbench" },
  { path: "/scenario-lab", label: "Scenario Lab" },
  { path: "/data-center", label: "Data Center" },
  { path: "/proposals", label: "Proposal Review" },
  { path: "/case-checks", label: "Case Checks" },
  { path: "/business", label: "Business Impact" },
  { path: "/pilot-tracker", label: "Pilot Tracker" }
] as const;