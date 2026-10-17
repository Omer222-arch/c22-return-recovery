"""SQLite repository for proposals and realized outcomes.

SQLite is convenient for local development and tests. On serverless hosts such
as Vercel, use a managed database adapter because local files are not durable.
"""
from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from typing import Any

DEFAULT_DB_PATH = Path(os.getenv("C22_DB_PATH", Path(__file__).resolve().parents[2] / "data" / "c22_workflow.sqlite3"))


class ProposalRepository:
    def __init__(self, db_path: str | Path | None = None):
        self.db_path = Path(db_path or DEFAULT_DB_PATH)
        if str(self.db_path) != ":memory:":
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(str(self.db_path), timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def _initialize(self) -> None:
        with self._connect() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS proposals (
                    proposal_id TEXT PRIMARY KEY,
                    created_at_utc TEXT NOT NULL,
                    lot_id TEXT NOT NULL,
                    status TEXT NOT NULL CHECK(status IN ('reviewed','approved','rejected','executed')),
                    reviewed_route TEXT NOT NULL,
                    reviewer TEXT NOT NULL,
                    rationale TEXT NOT NULL,
                    payload_json TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS outcomes (
                    outcome_id TEXT PRIMARY KEY,
                    proposal_id TEXT NOT NULL REFERENCES proposals(proposal_id),
                    recorded_at_utc TEXT NOT NULL,
                    actual_gross_recovery REAL NOT NULL,
                    actual_processing_cost REAL NOT NULL,
                    actual_handling_cost REAL NOT NULL,
                    rework_units INTEGER NOT NULL DEFAULT 0,
                    notes TEXT NOT NULL DEFAULT '',
                    payload_json TEXT NOT NULL
                );
            """)

    def create_proposal(self, proposal: dict[str, Any]) -> dict[str, Any]:
        with self._connect() as conn:
            conn.execute("""INSERT INTO proposals
                (proposal_id, created_at_utc, lot_id, status, reviewed_route, reviewer, rationale, payload_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)""", (
                proposal["proposal_id"], proposal["created_at_utc"], proposal["lot"]["lot_id"],
                proposal.get("status", "reviewed"), proposal["reviewed_route"], proposal["reviewer"],
                proposal["rationale"], json.dumps(proposal, allow_nan=False),
            ))
        return proposal

    def get_proposal(self, proposal_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT payload_json FROM proposals WHERE proposal_id = ?", (proposal_id,)).fetchone()
        return json.loads(row["payload_json"]) if row else None

    def list_proposals(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute("SELECT payload_json FROM proposals ORDER BY created_at_utc DESC").fetchall()
        return [json.loads(row["payload_json"]) for row in rows]

    def update_status(self, proposal_id: str, status: str) -> dict[str, Any] | None:
        allowed = {"reviewed", "approved", "rejected", "executed"}
        if status not in allowed:
            raise ValueError(f"Unsupported proposal status: {status}")
        with self._connect() as conn:
            row = conn.execute("SELECT payload_json FROM proposals WHERE proposal_id = ?", (proposal_id,)).fetchone()
            if not row:
                return None
            payload = json.loads(row["payload_json"])
            payload["status"] = status
            conn.execute("UPDATE proposals SET status = ?, payload_json = ? WHERE proposal_id = ?",
                         (status, json.dumps(payload, allow_nan=False), proposal_id))
        return payload

    def create_outcome(self, outcome: dict[str, Any]) -> dict[str, Any]:
        with self._connect() as conn:
            conn.execute("""INSERT INTO outcomes
                (outcome_id, proposal_id, recorded_at_utc, actual_gross_recovery,
                 actual_processing_cost, actual_handling_cost, rework_units, notes, payload_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""", (
                outcome["outcome_id"], outcome["proposal_id"], outcome["recorded_at_utc"],
                outcome["actual_gross_recovery"], outcome["actual_processing_cost"],
                outcome["actual_handling_cost"], outcome["rework_units"], outcome["notes"],
                json.dumps(outcome, allow_nan=False),
            ))
        return outcome

    def list_outcomes(self, proposal_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute("SELECT payload_json FROM outcomes WHERE proposal_id = ? ORDER BY recorded_at_utc", (proposal_id,)).fetchall()
        return [json.loads(row["payload_json"]) for row in rows]
