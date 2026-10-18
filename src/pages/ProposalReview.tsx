
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  FilePlus2,
  Info,
  RefreshCw,
  Save,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";

import PageHeader from "../components/PageHeader";
import Chip from "../components/Chip";
import Button from "../components/Button";
import { apiRequest, formatINR } from "../api/client";

type Proposal = {
  proposal_id: string;
  lot_id: string;
  proposed_route: string;
  status: string;
  expected_recovery_inr: number | null;
  created_at: string;
  notes?: string | null;
};

type ProposalForm = {
  lot_id: string;
  proposed_route: string;
  expected_recovery_inr: string;
  notes: string;
};

const statuses = ["draft", "pending_review", "approved", "rejected"];

const routes = [
  { value: "resale", label: "Resale", description: "Recover value by reselling the lot." },
  { value: "refurbish", label: "Refurbish", description: "Repair or restore before resale." },
  { value: "scrap", label: "Scrap", description: "Recover residual or material value." },
];

const initialForm: ProposalForm = {
  lot_id: "",
  proposed_route: "resale",
  expected_recovery_inr: "",
  notes: "",
};

const statusLabel = (status: string) =>
  status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Something went wrong. Please try again.";
}

function statusTone(status: string): "success" | "warning" | "neutral" | "blue" {
  switch (status.toLowerCase()) {
    case "approved":
      return "success";
    case "rejected":
      return "warning";
    case "pending_review":
      return "blue";
    default:
      return "neutral";
  }
}

export default function ProposalReview() {
  const [rows, setRows] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(true);
  const [form, setForm] = useState<ProposalForm>(initialForm);
  const [formError, setFormError] = useState("");

  const load = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setError("");

    try {
      const result = await apiRequest<Proposal[]>("/api/proposals");
      setRows(Array.isArray(result) ? result : []);
    } catch (e) {
      setError(getErrorMessage(e) || "Could not load proposals.");
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function updateForm<K extends keyof ProposalForm>(
    key: K,
    value: ProposalForm[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setFormError("");
  }

  async function createProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setFormError("");

    const lotId = form.lot_id.trim();
    const amountText = form.expected_recovery_inr.trim();
    const amount =
      amountText === "" ? null : Number(amountText);

    if (!lotId) {
      setFormError("Enter a lot ID to associate with this proposal.");
      return;
    }

    if (
      amount !== null &&
      (!Number.isFinite(amount) || amount < 0)
    ) {
      setFormError("Expected recovery must be a valid non-negative amount.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        lot_id: lotId,
        proposed_route: form.proposed_route,
        expected_recovery_inr: amount,
        notes: form.notes.trim() || null,
        status: "draft",
      };

      // Create the proposal in backend persistence first.
      await apiRequest<Proposal>("/api/proposals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      // Reload from the API so the saved record appears with existing
      // proposals, rather than being added only to temporary UI state.
      await load(false);

      setForm(initialForm);
      setShowForm(false);
      setNotice(
        "Proposal saved. The proposal list has been refreshed from the backend.",
      );
    } catch (e) {
      setFormError(
        `Could not save proposal. ${getErrorMessage(e)}`,
      );
    } finally {
      setSaving(false);
    }
  }

  async function update(proposalId: string, status: string) {
    setError("");
    setNotice("");
    setUpdatingId(proposalId);

    try {
      await apiRequest(
        `/api/proposals/${encodeURIComponent(proposalId)}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status }),
        },
      );

      setNotice(
        `Proposal ${proposalId} updated to ${statusLabel(status)}.`,
      );

      await load(false);
    } catch (e) {
      setError(getErrorMessage(e) || "Could not update proposal status.");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="pr-page">
      <style>{`
        .pr-page {
          --pr-text: #172033;
          --pr-muted: #64748b;
          --pr-border: #e2e8f0;
          --pr-soft: #f8fafc;
          --pr-primary: #4f46e5;
          color: var(--pr-text);
          display: grid;
          gap: 20px;
          min-width: 0;
        }

        .pr-page * { box-sizing: border-box; }

        .pr-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .pr-notice {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 14px 16px;
          border-radius: 12px;
          border: 1px solid #dbeafe;
          background: #eff6ff;
          color: #1e40af;
          font-size: 13px;
          line-height: 1.7;
        }

        .pr-notice strong {
          display: block;
          color: #1e3a8a;
          margin-bottom: 3px;
        }

        .pr-notice span {
          display: block;
          color: #1e40af;
        }

        .pr-notice-error {
          border-color: #fecdd3;
          background: #fff1f2;
          color: #be123c;
        }

        .pr-notice-error strong,
        .pr-notice-error span { color: #9f1239; }

        .pr-notice-success {
          border-color: #a7f3d0;
          background: #ecfdf5;
          color: #047857;
        }

        .pr-notice-success strong,
        .pr-notice-success span { color: #065f46; }

        .pr-dismiss {
          margin-left: auto;
          border: 0;
          background: transparent;
          color: inherit;
          padding: 2px;
          cursor: pointer;
        }

        .pr-create-panel {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 22px;
          box-shadow: 0 2px 9px rgba(15, 23, 42, .035);
        }

        .pr-panel-heading {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 14px;
          flex-wrap: wrap;
          margin-bottom: 20px;
        }

        .pr-panel-title {
          display: flex;
          align-items: center;
          gap: 11px;
        }

        .pr-panel-icon {
          display: grid;
          place-items: center;
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: #eef2ff;
          color: #4f46e5;
          flex-shrink: 0;
        }

        .pr-panel-heading h2 {
          font-size: 17px;
          font-weight: 750;
          margin: 0;
          color: #172033;
        }

        .pr-panel-heading p {
          margin: 5px 0 0;
          font-size: 12px;
          line-height: 1.6;
          color: #64748b;
        }

        .pr-collapse {
          border: 1px solid #dbe3ef;
          background: #fff;
          color: #334155;
          border-radius: 9px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }

        .pr-collapse:hover {
          background: #eef2ff;
          border-color: #c7d2fe;
          color: #4338ca;
        }

        .pr-form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
        }

        .pr-field {
          display: grid;
          gap: 7px;
          min-width: 0;
        }

        .pr-field-full { grid-column: 1 / -1; }

        .pr-field label {
          font-size: 12px;
          font-weight: 650;
          color: #334155;
        }

        .pr-required { color: #dc2626; }

        .pr-field input,
        .pr-field select,
        .pr-field textarea {
          width: 100%;
          min-width: 0;
          border: 1px solid #cbd5e1;
          background: #fff;
          color: #172033;
          border-radius: 10px;
          padding: 11px 12px;
          font: inherit;
          font-size: 13px;
          outline: none;
          transition: border-color .18s, box-shadow .18s;
        }

        .pr-field textarea {
          min-height: 94px;
          resize: vertical;
        }

        .pr-field input::placeholder,
        .pr-field textarea::placeholder { color: #94a3b8; }

        .pr-field input:focus,
        .pr-field select:focus,
        .pr-field textarea:focus {
          border-color: #818cf8;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, .12);
        }

        .pr-field-help {
          font-size: 11px;
          line-height: 1.5;
          color: #64748b;
        }

        .pr-route-options {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }

        .pr-route-option {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          border: 1px solid #e2e8f0;
          border-radius: 11px;
          padding: 12px;
          cursor: pointer;
          background: #fff;
          transition: border-color .18s, background .18s, box-shadow .18s;
        }

        .pr-route-option:hover {
          border-color: #c7d2fe;
          background: #fafaff;
        }

        .pr-route-option.selected {
          border-color: #818cf8;
          background: #eef2ff;
          box-shadow: 0 0 0 1px #818cf8;
        }

        .pr-route-option input {
          width: 15px;
          height: 15px;
          margin: 2px 0 0;
          accent-color: #4f46e5;
          flex-shrink: 0;
        }

        .pr-route-name {
          display: block;
          font-size: 12px;
          font-weight: 700;
          color: #1e293b;
        }

        .pr-route-description {
          display: block;
          margin-top: 5px;
          color: #64748b;
          font-size: 11px;
          font-weight: 400;
          line-height: 1.5;
        }

        .pr-form-error {
          padding: 11px 13px;
          border: 1px solid #fecdd3;
          border-radius: 10px;
          background: #fff1f2;
          color: #9f1239;
          font-size: 12px;
          line-height: 1.6;
        }

        .pr-form-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          margin-top: 20px;
          padding-top: 17px;
          border-top: 1px solid #e2e8f0;
        }

        .pr-form-note {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 11px;
          line-height: 1.5;
          color: #64748b;
        }

        .pr-table-card {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 20px;
          min-width: 0;
          box-shadow: 0 2px 9px rgba(15, 23, 42, .035);
        }

        .pr-table-heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
          margin-bottom: 17px;
        }

        .pr-table-heading h2 {
          margin: 0;
          font-size: 17px;
          color: #172033;
        }

        .pr-table-heading p {
          margin: 5px 0 0;
          font-size: 12px;
          color: #64748b;
          line-height: 1.6;
        }

        .pr-table-wrap {
          overflow-x: auto;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
        }

        .pr-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }

        .pr-table th,
        .pr-table td {
          padding: 13px 14px;
          text-align: left;
          vertical-align: middle;
          border-bottom: 1px solid #e2e8f0;
        }

        .pr-table th {
          background: #f8fafc;
          color: #475569;
          font-size: 10px;
          font-weight: 750;
          letter-spacing: .055em;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .pr-table td { color: #334155; }

        .pr-table tbody tr:hover { background: #fafaff; }
        .pr-table tbody tr:last-child td { border-bottom: 0; }

        .pr-id {
          display: block;
          color: #312e81;
          font-weight: 700;
        }

        .pr-date {
          display: block;
          margin-top: 5px;
          font-size: 10px;
          color: #64748b;
        }

        .pr-route-pill {
          display: inline-block;
          border-radius: 7px;
          padding: 5px 8px;
          background: #eef2ff;
          color: #4338ca;
          font-size: 11px;
          font-weight: 650;
          white-space: nowrap;
        }

        .pr-recovery {
          white-space: nowrap;
          font-weight: 700;
          color: #172033;
        }

        .pr-notes {
          min-width: 130px;
          max-width: 240px;
          white-space: normal;
          line-height: 1.6;
          overflow-wrap: anywhere;
        }

        .pr-status-select {
          min-width: 125px;
          border: 1px solid #cbd5e1;
          background: #fff;
          color: #334155;
          border-radius: 8px;
          padding: 8px 9px;
          font-size: 11px;
          outline: none;
        }

        .pr-status-select:focus {
          border-color: #818cf8;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, .12);
        }

        .pr-status-select:disabled {
          opacity: .55;
          cursor: wait;
        }

        .pr-empty {
          text-align: center;
          padding: 38px 18px;
          background: #f8fafc;
          border: 1px dashed #cbd5e1;
          border-radius: 12px;
        }

        .pr-empty-icon {
          display: grid;
          place-items: center;
          width: 50px;
          height: 50px;
          margin: 0 auto 13px;
          border-radius: 14px;
          background: #eef2ff;
          color: #4f46e5;
        }

        .pr-empty h3 {
          margin: 0;
          font-size: 14px;
          color: #1e293b;
        }

        .pr-empty p {
          margin: 8px auto 0;
          max-width: 430px;
          font-size: 12px;
          color: #64748b;
          line-height: 1.7;
        }

        .pr-footnote {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          color: #64748b;
          font-size: 11px;
          line-height: 1.7;
        }

        @media (max-width: 760px) {
          .pr-form-grid { grid-template-columns: 1fr; }
          .pr-field-full { grid-column: auto; }
          .pr-route-options { grid-template-columns: 1fr; }
          .pr-create-panel, .pr-table-card { padding: 15px; }
          .pr-form-footer { align-items: flex-start; }
        }
      `}</style>

      <PageHeader
        eyebrow="DECISION GOVERNANCE"
        title="Proposal review"
        description="Create recovery proposals, review suggested routes, and track decisions for each lot."
        actions={
          <div className="pr-actions">
            <Button
              variant="secondary"
              onClick={() => void load()}
              loading={loading}
            >
              <RefreshCw size={16} />
              Refresh
            </Button>

            <Button
              onClick={() => {
                setShowForm((current) => !current);
                setFormError("");
              }}
            >
              {showForm ? <X size={16} /> : <FilePlus2 size={16} />}
              {showForm ? "Close form" : "Add proposal"}
            </Button>
          </div>
        }
      />

      <div className="pr-notice">
        <Info size={19} />
        <div>
          <strong>How proposal review works</strong>
          <span>
            Create a proposal for a lot, select a recovery route, and optionally
            enter the expected recovery amount and notes. Newly created proposals
            start in Draft. Once saved, they are loaded from the backend and
            appear in the table below. Expected recovery is an estimate, not a
            guaranteed result.
          </span>
        </div>
      </div>

      {error && (
        <div className="pr-notice pr-notice-error" role="alert">
          <XCircle size={19} />
          <div style={{ flex: 1 }}>
            <strong>Could not complete request</strong>
            <span>{error}</span>
          </div>
          <button
            className="pr-dismiss"
            type="button"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {notice && (
        <div className="pr-notice pr-notice-success" role="status">
          <CheckCircle2 size={19} />
          <div style={{ flex: 1 }}>
            <strong>Saved successfully</strong>
            <span>{notice}</span>
          </div>
          <button
            className="pr-dismiss"
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {showForm && (
        <section className="pr-create-panel">
          <div className="pr-panel-heading">
            <div className="pr-panel-title">
              <span className="pr-panel-icon">
                <FilePlus2 size={20} />
              </span>
              <div>
                <h2>Create recovery proposal</h2>
                <p>
                  Enter the lot and recommended route. Fields marked with *
                  are required.
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={(event) => void createProposal(event)}>
            <div className="pr-form-grid">
              <div className="pr-field">
                <label htmlFor="pr-lot-id">
                  Lot ID <span className="pr-required">*</span>
                </label>
                <input
                  id="pr-lot-id"
                  value={form.lot_id}
                  onChange={(event) => updateForm("lot_id", event.target.value)}
                  placeholder="e.g. LOT-1001"
                  required
                  maxLength={120}
                />
                <span className="pr-field-help">
                  Enter the ID of the lot this proposal applies to.
                </span>
              </div>

              <div className="pr-field">
                <label htmlFor="pr-recovery">
                  Expected recovery (INR)
                </label>
                <input
                  id="pr-recovery"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.expected_recovery_inr}
                  onChange={(event) =>
                    updateForm("expected_recovery_inr", event.target.value)
                  }
                  placeholder="e.g. 12500"
                />
                <span className="pr-field-help">
                  Optional estimated amount in Indian rupees.
                </span>
              </div>

              <div className="pr-field pr-field-full">
                <label>
                  Proposed recovery route{" "}
                  <span className="pr-required">*</span>
                </label>

                <div className="pr-route-options">
                  {routes.map((route) => (
                    <label
                      key={route.value}
                      className={`pr-route-option ${
                        form.proposed_route === route.value ? "selected" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="proposed-route"
                        value={route.value}
                        checked={form.proposed_route === route.value}
                        onChange={() =>
                          updateForm("proposed_route", route.value)
                        }
                      />
                      <span>
                        <span className="pr-route-name">{route.label}</span>
                        <span className="pr-route-description">
                          {route.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pr-field pr-field-full">
                <label htmlFor="pr-notes">Notes and justification</label>
                <textarea
                  id="pr-notes"
                  value={form.notes}
                  onChange={(event) => updateForm("notes", event.target.value)}
                  placeholder="Explain why this recovery route is recommended, relevant condition details, or any review considerations..."
                  maxLength={2000}
                />
                <span className="pr-field-help">
                  Optional. Add context to help the reviewer make a decision.
                </span>
              </div>
            </div>

            {formError && (
              <div
                className="pr-form-error"
                role="alert"
                style={{ marginTop: 16 }}
              >
                <AlertCircle
                  size={15}
                  style={{
                    display: "inline",
                    verticalAlign: "middle",
                    marginRight: 6,
                  }}
                />
                {formError}
              </div>
            )}

            <div className="pr-form-footer">
              <div className="pr-form-note">
                <ShieldCheck size={15} />
                New proposals are saved with Draft status.
              </div>

              <div className="pr-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setForm(initialForm);
                    setFormError("");
                  }}
                  disabled={saving}
                >
                  Clear form
                </Button>

                <Button type="submit" loading={saving} disabled={saving}>
                  <Save size={16} />
                  {saving ? "Saving proposal..." : "Save proposal"}
                </Button>
              </div>
            </div>
          </form>
        </section>
      )}

      <section className="pr-table-card">
        <div className="pr-table-heading">
          <div>
            <h2>Recovery proposals</h2>
            <p>
              Saved proposals and their current review statuses.
            </p>
          </div>

          <Chip tone="blue">{rows.length} total</Chip>
        </div>

        {loading ? (
          <p className="muted-label">
            <RefreshCw
              size={15}
              style={{
                display: "inline",
                verticalAlign: "middle",
                marginRight: 7,
              }}
              className="pr-spin"
            />
            Loading proposals...
          </p>
        ) : rows.length === 0 ? (
          <div className="pr-empty">
            <div className="pr-empty-icon">
              <ClipboardCheck size={24} />
            </div>
            <h3>No proposals found</h3>
            <p>
              Create your first recovery proposal using the form above.
              After the backend saves it, it will appear here.
            </p>
          </div>
        ) : (
          <div className="pr-table-wrap">
            <table className="pr-table">
              <thead>
                <tr>
                  <th>Proposal</th>
                  <th>Lot</th>
                  <th>Route</th>
                  <th>Expected recovery</th>
                  <th>Notes</th>
                  <th>Status</th>
                  <th>Update status</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((proposal) => (
                  <tr key={proposal.proposal_id}>
                    <td>
                      <span className="pr-id">{proposal.proposal_id}</span>
                      <span className="pr-date">
                        {proposal.created_at
                          ? new Date(proposal.created_at).toLocaleDateString()
                          : "—"}
                      </span>
                    </td>

                    <td>{proposal.lot_id}</td>

                    <td>
                      <span className="pr-route-pill">
                        {proposal.proposed_route.replace(/_/g, " ")}
                      </span>
                    </td>

                    <td className="pr-recovery">
                      {proposal.expected_recovery_inr == null
                        ? "—"
                        : formatINR(proposal.expected_recovery_inr)}
                    </td>

                    <td className="pr-notes">{proposal.notes || "—"}</td>

                    <td>
                      <Chip tone={statusTone(proposal.status)}>
                        {statusLabel(proposal.status)}
                      </Chip>
                    </td>

                    <td>
                      <select
                        className="pr-status-select"
                        aria-label={`Status for ${proposal.proposal_id}`}
                        value={proposal.status}
                        disabled={updatingId === proposal.proposal_id}
                        onChange={(event) =>
                          void update(
                            proposal.proposal_id,
                            event.target.value,
                          )
                        }
                      >
                        {statuses.map((status) => (
                          <option key={status} value={status}>
                            {statusLabel(status)}
                          </option>
                        ))}
                      </select>
                      {updatingId === proposal.proposal_id && (
                        <span
                          style={{
                            display: "block",
                            marginTop: 5,
                            fontSize: 10,
                            color: "#64748b",
                          }}
                        >
                          Saving...
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="pr-footnote">
        <ClipboardCheck size={15} />
        Status changes and newly created proposals are saved through the
        backend API. Draft means not yet submitted, Pending Review means awaiting
        a decision, Approved means accepted, and Rejected means declined.
      </div>
    </div>
  );
}
