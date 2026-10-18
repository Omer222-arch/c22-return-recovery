import { Bell, CircleHelp, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

type Panel = "search" | "help" | "notifications" | "profile" | null;

const pages = [
  { path: "/", title: "Overview", section: "Workspace", description: "Portfolio overview and key recovery metrics" },
  { path: "/workbench", title: "Recovery Workbench", section: "Workspace", description: "Review recovery routes and recommendations" },
  { path: "/scenario-lab", title: "Scenario Lab", section: "Workspace", description: "Compare recovery scenarios and assumptions" },
  { path: "/data-center", title: "Data Center", section: "Workspace", description: "Import and analyze inventory data" },
  { path: "/proposals", title: "Proposal Review", section: "Control & Reporting", description: "Review and manage recovery proposals" },
  { path: "/case-checks", title: "Case Checks", section: "Control & Reporting", description: "Check case readiness and validation results" },
  { path: "/business", title: "Business Impact", section: "Control & Reporting", description: "Explore financial and business impact" },
  { path: "/pilot-tracker", title: "Pilot Tracker", section: "Control & Reporting", description: "Track pilot progress and outcomes" },
  { path: "/error", title: "Something went wrong", section: "System", description: "Review the current error page" },
  { path: "/404", title: "Page not found", section: "System", description: "Not-found page" },
];

export default function Topbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [panel, setPanel] = useState<Panel>(null);
  const [query, setQuery] = useState("");
  const [profileName, setProfileName] = useState("ReCoverIQ User");
  const searchRef = useRef<HTMLInputElement>(null);

  const currentPage = pages.find((page) => page.path === location.pathname);
  const title = currentPage?.title ?? "ReCoverIQ";
  const section = currentPage?.section ?? "Workspace";

  const searchResults = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return pages.filter((page) => !["/error", "/404"].includes(page.path)).slice(0, 5);
    return pages.filter((page) =>
      `${page.title} ${page.section} ${page.description}`.toLowerCase().includes(value)
    );
  }, [query]);

  useEffect(() => {
    if (panel === "search") searchRef.current?.focus();
  }, [panel]);

  useEffect(() => {
    setPanel(null);
  }, [location.pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPanel("search");
      }
      if (event.key === "Escape") setPanel(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const openPanel = (next: Exclude<Panel, null>) => {
    setPanel((current) => current === next ? null : next);
  };

  return (
    <header className="topbar">
      <div className="topbar-title">
        <span className="breadcrumb">{section}</span>
        <span className="breadcrumb-separator">/</span>
        <strong>{title}</strong>
      </div>

      <div className="topbar-actions">
        <button
          className={`icon-button search-button${panel === "search" ? " is-active" : ""}`}
          aria-label="Search pages"
          title="Search pages (Ctrl/⌘ + K)"
          aria-expanded={panel === "search"}
          onClick={() => openPanel("search")}
          type="button"
        >
          <Search size={18} />
        </button>
        <button
          className={`icon-button${panel === "help" ? " is-active" : ""}`}
          aria-label="Help"
          title="Help"
          aria-expanded={panel === "help"}
          onClick={() => openPanel("help")}
          type="button"
        >
          <CircleHelp size={18} />
        </button>
        <button
          className={`icon-button notification-button${panel === "notifications" ? " is-active" : ""}`}
          aria-label="Notifications"
          title="Notifications"
          aria-expanded={panel === "notifications"}
          onClick={() => openPanel("notifications")}
          type="button"
        >
          <Bell size={18} />
          <span />
        </button>
        <button
          className="profile-avatar"
          aria-label="Workspace profile menu"
          title="Profile menu"
          aria-expanded={panel === "profile"}
          onClick={() => openPanel("profile")}
          type="button"
        >
          RQ
        </button>
      </div>

      {panel && (
        <>
          <button
            type="button"
            className="topbar-dismiss"
            aria-label="Close topbar panel"
            onClick={() => setPanel(null)}
          />
          <section className={`topbar-popover topbar-popover-${panel}`} role="dialog" aria-label={`${panel} panel`}>
            <div className="topbar-popover-heading">
              <strong>
                {panel === "search" && "Search ReCoverIQ"}
                {panel === "help" && "Page help"}
                {panel === "notifications" && "Notifications"}
                {panel === "profile" && "Workspace profile"}
              </strong>
              <button className="topbar-popover-close" type="button" aria-label="Close" onClick={() => setPanel(null)}>
                <X size={16} />
              </button>
            </div>

            {panel === "search" && (
              <div className="topbar-search-content">
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search pages and tools..."
                  aria-label="Search pages and tools"
                />
                <div className="topbar-search-results">
                  {searchResults.length ? searchResults.map((page) => (
                    <button
                      type="button"
                      className="topbar-result"
                      key={page.path}
                      onClick={() => { navigate(page.path); setPanel(null); setQuery(""); }}
                    >
                      <span><strong>{page.title}</strong><small>{page.section} · {page.description}</small></span>
                      <span aria-hidden="true">↗</span>
                    </button>
                  )) : <p className="topbar-empty">No matching pages. Try another search.</p>}
                </div>
                <small className="topbar-shortcut">Tip: press Ctrl/⌘ + K to open search; Esc to close.</small>
              </div>
            )}

            {panel === "help" && (
              <div className="topbar-help-content">
                <p><strong>{title}</strong></p>
                <p>{currentPage?.description ?? "Navigate ReCoverIQ using the sidebar and page search."}</p>
                <p>Use the sidebar to switch sections. Imported inventory and analysis depend on the dataset available in Data Center.</p>
                <button type="button" className="topbar-primary-action" onClick={() => { navigate("/data-center"); setPanel(null); }}>
                  Open Data Center
                </button>
              </div>
            )}

            {panel === "notifications" && (
              <div className="topbar-help-content">
                <p><strong>No live notifications are connected yet.</strong></p>
                <p>This panel is ready for real proposal, import, or validation alerts when those events are wired into the app. It does not invent alerts.</p>
                <button type="button" className="topbar-primary-action" onClick={() => { navigate("/case-checks"); setPanel(null); }}>
                  Open Case Checks
                </button>
              </div>
            )}

            {panel === "profile" && (
              <div className="topbar-profile-content">
                <div className="topbar-profile-summary">
                  <span className="topbar-profile-avatar">RQ</span>
                  <span><strong>{profileName}</strong><small>Workspace profile</small></span>
                </div>
                <button type="button" className="topbar-result" onClick={() => { navigate("/"); setPanel(null); }}>
                  <span><strong>Go to Overview</strong><small>Return to your workspace home</small></span>
                  <span aria-hidden="true">↗</span>
                </button>
                <button type="button" className="topbar-result" onClick={() => { setProfileName("ReCoverIQ User"); setPanel(null); }}>
                  <span><strong>Reset profile label</strong><small>Restore the default local profile label</small></span>
                </button>
              </div>
            )}
          </section>
        </>
      )}

      <style>{`
        .topbar { position: relative; }
        .topbar-actions .icon-button, .topbar-actions .profile-avatar { cursor: pointer; }
        .topbar-actions .is-active { background: var(--surface-muted, #eef2f7); }
        .topbar-dismiss { position: fixed; inset: 0; z-index: 40; border: 0; padding: 0; background: transparent; cursor: default; }
        .topbar-popover { position: absolute; z-index: 41; right: 20px; top: calc(100% - 2px); width: min(390px, calc(100vw - 32px)); max-height: min(70vh, 540px); overflow: auto; background: var(--surface, #fff); color: var(--text-primary, #172033); border: 1px solid var(--border, #e2e8f0); border-radius: 14px; box-shadow: 0 18px 50px rgba(15,23,42,.16); padding: 14px; }
        .topbar-popover-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
        .topbar-popover-heading strong { font-size: 14px; }
        .topbar-popover-close { display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 8px; background: transparent; color: inherit; cursor: pointer; }
        .topbar-popover-close:hover { background: var(--surface-muted, #f1f5f9); }
        .topbar-search-content input { box-sizing: border-box; width: 100%; padding: 10px 12px; border: 1px solid var(--border, #dbe2ea); border-radius: 9px; outline: none; background: var(--surface, #fff); color: inherit; font: inherit; font-size: 13px; }
        .topbar-search-content input:focus { border-color: var(--accent, #647ce8); box-shadow: 0 0 0 3px rgba(100,124,232,.12); }
        .topbar-search-results { display: grid; gap: 4px; margin-top: 8px; }
        .topbar-result { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; padding: 10px; border: 0; border-radius: 9px; text-align: left; color: inherit; background: transparent; cursor: pointer; }
        .topbar-result:hover { background: var(--surface-muted, #f1f5f9); }
        .topbar-result span:first-child { display: grid; gap: 3px; min-width: 0; }
        .topbar-result strong { font-size: 12px; font-weight: 650; }
        .topbar-result small, .topbar-shortcut, .topbar-profile-summary small { display: block; color: var(--text-muted, #64748b); font-size: 11px; line-height: 1.45; }
        .topbar-empty { padding: 10px; color: var(--text-muted, #64748b); font-size: 12px; }
        .topbar-shortcut { margin-top: 10px; }
        .topbar-help-content { font-size: 12px; line-height: 1.6; color: var(--text-secondary, #475569); }
        .topbar-help-content p { margin: 8px 0; }
        .topbar-help-content p strong { color: var(--text-primary, #172033); }
        .topbar-primary-action { margin-top: 8px; padding: 9px 12px; border: 0; border-radius: 8px; color: white; background: var(--accent, #5269d9); cursor: pointer; font: inherit; font-size: 12px; font-weight: 600; }
        .topbar-profile-summary { display: flex; align-items: center; gap: 10px; padding: 8px 6px 14px; border-bottom: 1px solid var(--border, #e2e8f0); margin-bottom: 6px; }
        .topbar-profile-summary > span:last-child { display: grid; gap: 3px; }
        .topbar-profile-summary strong { font-size: 12px; }
        .topbar-profile-avatar { display: grid; place-items: center; width: 36px; height: 36px; flex: 0 0 auto; border-radius: 50%; color: white; background: var(--accent, #5269d9); font-size: 12px; font-weight: 700; }
        @media (max-width: 600px) { .topbar-popover { right: 8px; } }
      `}</style>
    </header>
  );
}
