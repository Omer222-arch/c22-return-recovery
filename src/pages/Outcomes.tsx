
import { useEffect, useState } from "react";
import type { Outcome, Proposal } from "../types";
import { loadProposals } from "../services/proposalService";
import {
  loadOutcomes,
  saveOutcome,
  deleteOutcome,
  calculateVariance,
} from "../services/outcomeService";
import "../styles/data-center.css";

export default function Outcomes() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [proposalId, setProposalId] = useState("");
  const [actualRecovery, setActualRecovery] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function refreshData() {
    try {
      const [proposalData, outcomeData] = await Promise.all([
        loadProposals(),
        loadOutcomes(),
      ]);

      setProposals(proposalData);
      setOutcomes(outcomeData);

      setProposalId((currentId) => {
        if (currentId && proposalData.some((p) => p.proposal_id === currentId)) {
          return currentId;
        }

        return proposalData[0]?.proposal_id ?? "";
      });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to load outcomes. Check that the backend is running."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshData();
  }, []);

  function formatINR(value: number | null) {
    if (value === null) return "Unknown";

    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(value);
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const selectedProposal = proposals.find(
      (proposal) => proposal.proposal_id === proposalId
    );

    if (!selectedProposal) {
      setMessage("Create a proposal before recording an outcome.");
      return;
    }

    const amount =
      actualRecovery.trim() === "" ? null : Number(actualRecovery);

    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      setMessage("Enter a valid, non-negative amount.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const result = await saveOutcome({
        proposal_id: selectedProposal.proposal_id,
        lot_id: selectedProposal.lot_id,
        actual_recovery_inr: amount,
        notes: notes.trim() || undefined,
      });

      setMessage(result.message);

      if (result.success) {
        setActualRecovery("");
        setNotes("");
        await refreshData();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(outcomeId: string) {
    const result = await deleteOutcome(outcomeId);
    setMessage(result.message);

    if (result.success) {
      await refreshData();
    }
  }

  return (
    <main className="data-center">
      <header className="data-header">
        <div>
          <p className="eyebrow">RECOVERIQ / PERFORMANCE</p>
          <h1>Outcomes &amp; Variance</h1>
          <p>
            Record actual recovery and compare it with the expected amount.
          </p>
        </div>
      </header>

      <section className="data-panel">
        <h2>Record an outcome</h2>

        {loading ? (
          <p>Loading proposals and outcomes...</p>
        ) : proposals.length === 0 ? (
          <p>
            No proposals found. Open Proposal Review and create a proposal
            before recording an outcome.
          </p>
        ) : (
          <form className="proposal-form" onSubmit={handleSave}>
            <label>
              Proposal
              <select
                value={proposalId}
                onChange={(event) => setProposalId(event.target.value)}
                required
              >
                {proposals.map((proposal) => (
                  <option
                    key={proposal.proposal_id}
                    value={proposal.proposal_id}
                  >
                    {proposal.proposal_id} — {proposal.lot_id} (
                    {proposal.proposed_route})
                  </option>
                ))}
              </select>
            </label>

            <label>
              Actual recovery (INR)
              <input
                type="number"
                min="0"
                step="0.01"
                value={actualRecovery}
                onChange={(event) => setActualRecovery(event.target.value)}
                placeholder="Leave blank if unknown"
              />
            </label>

            <label>
              Notes
              <textarea
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional outcome notes"
              />
            </label>

            <button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save outcome"}
            </button>
          </form>
        )}

        {message && <p role="status">{message}</p>}
      </section>

      <section className="data-panel">
        <div className="proposal-list-header">
          <h2>Recorded outcomes</h2>
          <span>{outcomes.length} outcomes</span>
        </div>

        {loading ? (
          <p>Loading outcomes...</p>
        ) : outcomes.length === 0 ? (
          <p>No outcomes recorded yet.</p>
        ) : (
          <div className="proposal-list">
            {outcomes.map((outcome) => {
              const proposal = proposals.find(
                (item) => item.proposal_id === outcome.proposal_id
              );

              const variance = proposal
                ? calculateVariance(proposal, outcome)
                : null;

              return (
                <article className="proposal-card" key={outcome.outcome_id}>
                  <div>
                    <h3>{outcome.outcome_id}</h3>
                    <p>
                      Lot: <strong>{outcome.lot_id}</strong>
                    </p>
                    <p>
                      Proposal: <strong>{outcome.proposal_id}</strong>
                    </p>
                    <p>
                      Expected recovery:{" "}
                      <strong>
                        {formatINR(proposal?.expected_recovery_inr ?? null)}
                      </strong>
                    </p>
                    <p>
                      Actual recovery:{" "}
                      <strong>
                        {formatINR(outcome.actual_recovery_inr)}
                      </strong>
                    </p>
                    <p>
                      Variance:{" "}
                      <strong>
                        {variance === null
                          ? "Unknown"
                          : `${variance > 0 ? "+" : ""}${formatINR(variance)}`}
                      </strong>
                    </p>
                    {outcome.notes && <p>Notes: {outcome.notes}</p>}
                    <p className="proposal-date">
                      Recorded:{" "}
                      {new Date(outcome.recorded_at).toLocaleString()}
                    </p>
                  </div>

                  <div className="proposal-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void handleDelete(outcome.outcome_id)}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
