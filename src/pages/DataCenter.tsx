
import "../styles/data-center.css";
import { useEffect, useRef, useState } from "react";

import { starterLots } from "../data/starterData";
import type { Lot } from "../data/starterData";
import type { ValidationIssue } from "../utils/validation";

import {
  loadLotsFromBackend,
  saveLotsToBackend,
  resetLotsFromBackend,
  validateLotsWithBackend,
} from "../services/dataService";

export default function DataCenter() {
  const [lots, setLots] = useState<Lot[]>(
    () => structuredClone(starterLots)
  );
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [status, setStatus] = useState("Loading recovery lots...");
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");

  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;

    async function initialize() {
      const result = await loadLotsFromBackend();

      if (!active) return;

      setLots(result.lots);
      setStatus(
        result.warning ??
          (result.source === "saved"
            ? "Recovery lots loaded from the backend."
            : "Starter dataset loaded.")
      );
      setLoading(false);
    }

    void initialize();

    return () => {
      active = false;
    };
  }, []);

  async function importFile(file?: File) {
    if (!file) return;

    setLoading(true);
    setFileName(file.name);
    setStatus("Reading and validating file...");
    setIssues([]);

    try {
      const text = await file.text();
      let parsed: unknown;

      if (file.name.toLowerCase().endsWith(".json")) {
        parsed = JSON.parse(text);
      } else if (file.name.toLowerCase().endsWith(".csv")) {
        throw new Error(
          "CSV support is not connected yet. Please upload a JSON file."
        );
      } else {
        throw new Error(
          "Unsupported file type. Please choose a JSON file."
        );
      }

      let records: unknown;

      if (Array.isArray(parsed)) {
        records = parsed;
      } else if (
        typeof parsed === "object" &&
        parsed !== null &&
        "records" in parsed
      ) {
        const fixture = parsed as {
          records?: { lots?: unknown };
        };

        records = fixture.records?.lots;
      } else {
        records = undefined;
      }

      const validation = await validateLotsWithBackend(records);
      setIssues(validation.issues);

      if (!validation.valid) {
        setStatus(
          "Import rejected — the current dataset was preserved."
        );
        return;
      }

      const saved = await saveLotsToBackend(validation.lots);

      if (!saved.success) {
        setIssues([
          ...validation.issues,
          {
            row: 0,
            field: "backend storage",
            message: saved.message,
            severity: "error",
          },
        ]);

        setStatus(
          "Import not saved — the current dataset was preserved."
        );
        return;
      }

      setLots(validation.lots);
      setIssues(validation.issues);
      setStatus(
        `Successfully imported and saved ${validation.lots.length} lots to the backend.`
      );
    } catch (error) {
      setIssues([
        {
          row: 0,
          field: "file",
          message:
            error instanceof Error
              ? error.message
              : "Unable to read this file.",
          severity: "error",
        },
      ]);

      setStatus(
        "Import failed — the current dataset was preserved."
      );
    } finally {
      setLoading(false);

      if (fileInput.current) {
        fileInput.current.value = "";
      }
    }
  }

  async function resetData() {
    setLoading(true);
    setStatus("Restoring starter dataset...");
    setIssues([]);

    try {
      const result = await resetLotsFromBackend();

      if (!result.success) {
        setStatus(
          `Reset failed — the current dataset was preserved. ${result.message}`
        );
        return;
      }

      setLots(result.lots);
      setFileName("");
      setStatus("Starter dataset restored and saved to the backend.");

      if (fileInput.current) {
        fileInput.current.value = "";
      }
    } finally {
      setLoading(false);
    }
  }

  const totalUnits = lots.reduce(
    (total, lot) => total + (lot.units ?? 0),
    0
  );

  const unknownUnitLots = lots.filter(
    (lot) => lot.units === null
  ).length;

  const errorCount = issues.filter(
    (issue) => issue.severity === "error"
  ).length;

  const warningCount = issues.filter(
    (issue) => issue.severity === "warning"
  ).length;

  return (
    <main className="data-center">
      <header className="page-header">
        <div>
          <p className="eyebrow">RECOVERIQ / DATA</p>
          <h1>Data Center</h1>
          <p className="subtitle">
            Import, validate, and review recovery lot records.
          </p>
        </div>

        <button
          className="secondary-button"
          onClick={() => void resetData()}
          disabled={loading}
        >
          Reset to starter data
        </button>
      </header>

      <section className="summary-grid">
        <article className="summary-card">
          <span>Current lots</span>
          <strong>{lots.length}</strong>
        </article>

        <article className="summary-card">
          <span>Known units</span>
          <strong>{totalUnits.toLocaleString("en-IN")}</strong>
          {unknownUnitLots > 0 && (
            <small>
              {unknownUnitLots} lot(s) have unknown units
            </small>
          )}
        </article>

        <article className="summary-card">
          <span>Validation errors</span>
          <strong className={errorCount > 0 ? "danger-text" : ""}>
            {errorCount}
          </strong>
        </article>

        <article className="summary-card">
          <span>Warnings</span>
          <strong className={warningCount > 0 ? "warning-text" : ""}>
            {warningCount}
          </strong>
        </article>
      </section>

      <section
        className={`upload-panel ${dragging ? "dragging" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (
            !event.currentTarget.contains(
              event.relatedTarget as Node
            )
          ) {
            setDragging(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);

          if (!loading) {
            void importFile(event.dataTransfer.files[0]);
          }
        }}
      >
        <div className="upload-icon">↑</div>
        <h2>Import dataset</h2>
        <p>Drag and drop a JSON file here, or choose a file.</p>

        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(event) => {
            void importFile(event.target.files?.[0]);
          }}
        />

        <button
          className="primary-button"
          onClick={() => fileInput.current?.click()}
          disabled={loading}
        >
          {loading ? "Please wait..." : "Choose file"}
        </button>

        {fileName && (
          <p className="file-name">Selected: {fileName}</p>
        )}

        <p
          className="status-message"
          role="status"
          aria-live="polite"
        >
          {status}
        </p>
      </section>

      {issues.length > 0 && (
        <section className="content-panel">
          <h2>Validation report</h2>
          <p className="subtitle">
            Failed imports do not replace the current dataset.
          </p>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Field</th>
                  <th>Severity</th>
                  <th>Issue / suggested fix</th>
                </tr>
              </thead>

              <tbody>
                {issues.map((issue, index) => (
                  <tr key={`${issue.row}-${issue.field}-${index}`}>
                    <td>{issue.row || "File"}</td>
                    <td>{issue.field}</td>
                    <td>
                      <span className={`severity ${issue.severity}`}>
                        {issue.severity}
                      </span>
                    </td>
                    <td>{issue.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="content-panel">
        <div className="section-heading">
          <div>
            <h2>Recovery lots</h2>
            <p className="subtitle">
              Null values remain unknown; they are never treated as zero.
            </p>
          </div>

          <span className="record-count">{lots.length} records</span>
        </div>

        {lots.length === 0 ? (
          <p className="empty-state">
            No records available. Import a valid dataset or restore starter data.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Lot ID</th>
                  <th>Units</th>
                  <th>Inspection</th>
                  <th>Refurbishment</th>
                  <th>Handling</th>
                  <th>Resale price</th>
                  <th>Scrap recovery</th>
                </tr>
              </thead>

              <tbody>
                {lots.map((lot) => (
                  <tr key={lot.lot_id}>
                    <td className="lot-id">{lot.lot_id}</td>
                    <td>{lot.units ?? "Unknown"}</td>
                    <td>
                      <span
                        className={`inspection ${
                          lot.inspection ?? "unknown"
                        }`}
                      >
                        {lot.inspection ?? "Unknown"}
                      </span>
                    </td>
                    <td>{formatINR(lot.refurbishment_inr)}</td>
                    <td>{formatINR(lot.handling_inr)}</td>
                    <td>{formatINR(lot.resale_price_inr)}</td>
                    <td>{formatINR(lot.scrap_recovery_inr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function formatINR(value: number | null): string {
  if (value === null) {
    return "Unknown";
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}
