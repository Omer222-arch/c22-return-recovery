
import json
from pathlib import Path
from threading import Lock
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.validation import validate_lots
from backend.proposals import (
    list_proposals,
    create_proposal,
    update_proposal_status,
    delete_proposal,
)
from backend.outcomes import (
    list_outcomes,
    create_outcome,
    calculate_variance,
    delete_outcome,
)

app = FastAPI(
    title="ReCoverIQ API",
    description="Data validation, recovery lots, proposals, and outcomes",
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Persistent storage for recovery lots.
DATA_DIR = Path(__file__).resolve().parent / "data"
LOTS_FILE = DATA_DIR / "lots.json"
LOTS_LOCK = Lock()


class LotInput(BaseModel):
    lot_id: str
    units: int | None = Field(default=None, ge=1)
    inspection: Literal["approved", "pending", "rejected"] | None
    refurbishment_inr: float | None = Field(default=None, ge=0)
    handling_inr: float | None = Field(default=None, ge=0)
    resale_price_inr: float | None = Field(default=None, ge=0)
    scrap_recovery_inr: float | None = Field(default=None, ge=0)


class LotsInput(BaseModel):
    lots: list[dict]


class ProposalInput(BaseModel):
    lot_id: str
    proposed_route: Literal["refurbish", "resale", "scrap"]
    status: Literal[
        "draft", "pending_review", "approved", "rejected"
    ] = "draft"
    expected_recovery_inr: float | None = Field(default=None, ge=0)
    notes: str | None = None


class ProposalStatusInput(BaseModel):
    status: Literal[
        "draft", "pending_review", "approved", "rejected"
    ]


class OutcomeInput(BaseModel):
    proposal_id: str
    actual_recovery_inr: float | None = Field(default=None, ge=0)
    notes: str | None = None


def read_lots():
    """Read persisted lots, or return an empty list if none exist."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    if not LOTS_FILE.exists():
        return []

    try:
        with LOTS_LOCK:
            with LOTS_FILE.open("r", encoding="utf-8") as file:
                lots = json.load(file)

        if not isinstance(lots, list):
            raise ValueError("Stored lots must be a JSON array.")

        result = validate_lots(lots)
        if not result["valid"]:
            raise ValueError("Stored lots failed validation.")

        return result["lots"]

    except (OSError, json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to read saved lots: {exc}",
        ) from exc


def write_lots(lots):
    """Validate and safely persist the complete lot dataset."""
    result = validate_lots(lots)

    if not result["valid"]:
        raise HTTPException(
            status_code=422,
            detail=result["issues"],
        )

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    temporary_file = LOTS_FILE.with_suffix(".tmp")

    try:
        with LOTS_LOCK:
            with temporary_file.open("w", encoding="utf-8") as file:
                json.dump(
                    result["lots"],
                    file,
                    indent=2,
                    ensure_ascii=False,
                )

            temporary_file.replace(LOTS_FILE)

    except OSError as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to save recovery lots.",
        ) from exc

    return result["lots"]


@app.get("/")
def health_check():
    return {"app": "ReCoverIQ", "status": "running"}


# ---------- Data validation ----------

@app.post("/api/validate")
def validate_data(payload: dict):
    records = payload.get("records", payload)
    lots = records.get("lots", []) if isinstance(records, dict) else records

    if not isinstance(lots, list):
        raise HTTPException(
            status_code=422,
            detail="Expected a list of lots.",
        )

    return validate_lots(lots)


# ---------- Recovery lots ----------

@app.get("/api/lots")
def get_lots():
    """Return the saved recovery lots."""
    return read_lots()


@app.put("/api/lots")
def put_lots(payload: LotsInput):
    """Validate and replace the saved recovery lot dataset."""
    return write_lots(payload.lots)


# ---------- Proposals ----------

@app.get("/api/proposals")
def get_proposals():
    return list_proposals()


@app.post("/api/proposals", status_code=201)
def post_proposal(payload: ProposalInput):
    try:
        return create_proposal(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@app.patch("/api/proposals/{proposal_id}/status")
def patch_proposal_status(
    proposal_id: str,
    payload: ProposalStatusInput,
):
    try:
        return update_proposal_status(proposal_id, payload.status)
    except KeyError:
        raise HTTPException(
            status_code=404,
            detail="Proposal not found.",
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

@app.delete("/api/proposals/{proposal_id}")
def remove_proposal(proposal_id: str):
    try:
        if not delete_proposal(proposal_id):
            raise HTTPException(
                status_code=404,
                detail="Proposal not found.",
            )

        return {
            "deleted": True,
            "proposal_id": proposal_id,
        }

    except ValueError as exc:
        raise HTTPException(
            status_code=409,
            detail=str(exc),
        )
    if not delete_proposal(proposal_id):
        raise HTTPException(
            status_code=404,
            detail="Proposal not found.",
        )

    return {"deleted": True, "proposal_id": proposal_id}


# ---------- Outcomes ----------

@app.get("/api/outcomes")
def get_outcomes():
    return list_outcomes()


@app.post("/api/outcomes", status_code=201)
def post_outcome(payload: OutcomeInput):
    try:
        return create_outcome(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@app.get("/api/proposals/{proposal_id}/variance")
def get_variance(proposal_id: str):
    try:
        return calculate_variance(proposal_id)
    except ValueError:
        raise HTTPException(
            status_code=404,
            detail="Proposal not found.",
        )


@app.delete("/api/outcomes/{outcome_id}")
def remove_outcome(outcome_id: str):
    if not delete_outcome(outcome_id):
        raise HTTPException(
            status_code=404,
            detail="Outcome not found.",
        )

    return {"deleted": True, "outcome_id": outcome_id}
