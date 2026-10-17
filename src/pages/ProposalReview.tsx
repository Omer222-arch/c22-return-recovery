
import { useEffect, useState } from "react";
import type { Proposal, ProposalStatus } from "../types";
import {
  loadProposals,
  saveProposal,
  updateProposalStatus,
  deleteProposal,
} from "../services/proposalService";
import { starterLots } from "../data/starterData";
import "../styles/data-center.css";

export default function ProposalReview() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [lotId, setLotId] = useState(starterLots[0]?.lot_id ?? "");
  const [route, setRoute] = useState<"refurbish" | "resale" | "scrap">(
    "refurbish"
  );
  const [recovery, setRecovery] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function refreshProposals() {
    try {
      const data = await loadProposals();
      setProposals(data);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to load proposals. Check that the backend is running."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshProposals();
  }, []);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const amount = recovery.trim() === "" ? null : Number(recovery);

    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      setMessage("Enter a valid, non-negative recovery amount.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const result = await saveProposal({
        lot_id: lotId,
        proposed_route: route,
        status: "draft",
        expected_recovery_inr: amount,
        notes: notes.trim() || undefined,
      });

      setMessage(result.message);

      if (result.success) {
        setRecovery("");
        setNotes("");
        await refreshProposals();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(
    proposalId: string,
    status: ProposalStatus
  ) {
    const result = await updateProposalStatus(proposalId, status);
    setMessage(result.message);

    if (result.success) {
      await refreshProposals();
    }
  }

  async function handleDelete(proposalId: string) {
    const result = await deleteProposal(proposalId);
    setMessage(result.message);

    if (result.success) {
      await refreshProposals();
    }
  }

  function formatINR(value: number | null) {
    if (value === null) return "Unknown";

    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(value);
  }

  return (
    <main className="data-center">
      <header className="data-header">
        <div>
          <p className="eyebrow">RECOVERIQ / PROPOSALS</p>
          <h1>Proposal Review</h1>
          <p>Create and review recovery proposals for your lots.</p>
        </div>
      </header>

      <section className="data-panel">
        <h2>Create a proposal</h2>

        <form onSubmit={handleCreate} className="proposal-form">
          <label>
            Recovery lot
            <select
              value={lotId}
              onChange={(event) => setLotId(event.target.value)}
              required
            >
              {starterLots.map((lot) => (
                <option key={lot.lot_id} value={lot.lot_id}>
                  {lot.lot_id} — {lot.units ?? "Unknown"} units
                  {lot.inspection === "pending"
                    ? " (inspection pending)"
                    : ""}
                  {lot.inspection === "rejected"
                    ? " (inspection rejected)"
                    : ""}
                </option>
              ))}
            </select>
          </label>

          <label>
            Proposed route
            <select
              value={route}
              onChange={(event) =>
                setRoute(
                  event.target.value as "refurbish" | "resale" | "scrap"
                )
              }
            >
              <option value="refurbish">Refurbish</option>
              <option value="resale">Resale</option>
              <option value="scrap">Scrap</option>
            </select>
          </label>

          <label>
            Expected recovery (INR)
            <input
              type="number"
              min="0"
              step="0.01"
              value={recovery}
              onChange={(event) => setRecovery(event.target.value)}
              placeholder="Leave blank if unknown"
            />
          </label>

          <label>
            Notes
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Add assumptions or review notes"
              rows={3}
            />
          </label>

          <button type="submit" disabled={saving || loading}>
            {saving ? "Saving..." : "Save draft proposal"}
          </button>
        </form>

        {message && <p role="status">{message}</p>}
      </section>

      <section className="data-panel">
        <div className="proposal-list-header">
          <h2>Saved proposals</h2>
          <span>{proposals.length} proposals</span>
        </div>

        {loading ? (
          <p>Loading proposals from the backend...</p>
        ) : proposals.length === 0 ? (
          <p>No proposals yet. Create your first proposal above.</p>
        ) : (
          <div className="proposal-list">
            {proposals.map((proposal) => (
              <article className="proposal-card" key={proposal.proposal_id}>
                <div>
                  <h3>{proposal.proposal_id}</h3>
                  <p>
                    Lot: <strong>{proposal.lot_id}</strong>
                    {" · "}
                    Route: <strong>{proposal.proposed_route}</strong>
                  </p>
                  <p>
                    Expected recovery:{" "}
                    <strong>
                      {formatINR(proposal.expected_recovery_inr)}
                    </strong>
                  </p>
                  {proposal.notes && <p>Notes: {proposal.notes}</p>}
                  <p className="proposal-date">
                    Updated: {new Date(proposal.updated_at).toLocaleString()}
                  </p>
                </div>

                <div className="proposal-actions">
                  <label>
                    Status
                    <select
                      value={proposal.status}
                      onChange={(event) =>
                        void handleStatusChange(
                          proposal.proposal_id,
                          event.target.value as ProposalStatus
                        )
                      }
                    >
                      <option value="draft">Draft</option>
                      <option value="pending_review">Pending review</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </label>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void handleDelete(proposal.proposal_id)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
