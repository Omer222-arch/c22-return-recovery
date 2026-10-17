"""HTTP API for the React frontend. Run locally with: uvicorn backend.api:app --reload"""
from __future__ import annotations

import os
import math
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.repositories.proposal_repository import ProposalRepository
from backend.services.fixture_service import get_assumptions, load_fixture, get_lots
from backend.services.proposal_service import compare_lot, create_reviewed_proposal, record_outcome
from backend.services.validation_service import validate_lot_batch, validate_lot_record
from engine import ROUTES

app = FastAPI(title="C22 Returned Stock Recovery API", version="0.1.0",
              description="Decision-support API. Estimates are not guaranteed or realized recovery.")
_origins = [origin.strip() for origin in os.getenv("C22_CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",") if origin.strip()]
app.add_middleware(CORSMiddleware, allow_origins=_origins, allow_credentials=False,
                   allow_methods=["GET", "POST", "PATCH", "OPTIONS"], allow_headers=["*"])

repo = ProposalRepository()


class ValidateBatchRequest(BaseModel):
    lots: list[dict[str, Any]]


class CompareRequest(BaseModel):
    lot: dict[str, Any]
    capacities: dict[str, float] | None = None
    confidence_override: float | None = Field(default=None, ge=0, le=1)
    price_multiplier: float = Field(default=1.0, gt=0, le=5)


class ProposalRequest(CompareRequest):
    route: str
    reviewer: str = Field(min_length=1, max_length=120)
    rationale: str = Field(min_length=1, max_length=3000)


class StatusRequest(BaseModel):
    status: str


class OutcomeRequest(BaseModel):
    actual_gross_recovery: float = Field(ge=0, allow_inf_nan=False)
    actual_processing_cost: float = Field(ge=0, allow_inf_nan=False)
    actual_handling_cost: float = Field(ge=0, allow_inf_nan=False)
    rework_units: int = Field(default=0, ge=0)
    notes: str = Field(default="", max_length=3000)


def _fixture() -> dict[str, Any]:
    try:
        fixture = load_fixture()

        if fixture.get("case_id") != "C22":
            raise ValueError("Unexpected fixture: expected case C22.")

        if fixture.get("data_version") != "v3.2":
            raise ValueError("Unexpected fixture version: expected v3.2.")

        records = fixture.get("records")
        if not isinstance(records, dict):
            raise ValueError("Invalid C22 fixture: missing records object.")

        lots = records.get("lots")
        if not isinstance(lots, list):
            raise ValueError("Invalid C22 fixture: records.lots must be a list.")

        errors = validate_lot_batch(lots)
        if errors.get("invalid"):
            raise ValueError(
                "Invalid C22 lot records: "
                + "; ".join(str(item) for item in errors["invalid"])
            )

        return fixture

    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


def _capacities(
    payload: dict[str, float] | None,
    fixture: dict[str, Any],
) -> dict[str, float]:
    """Return explicitly supplied route capacities.

    C22 v3.2 does not define route capacities, so do not invent defaults.
    When no capacities are supplied, leave routes unconstrained by capacity.
    """
    if payload is None:
        return {}

    unknown_routes = set(payload) - set(ROUTES)
    if unknown_routes:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown capacity routes: {sorted(unknown_routes)}",
        )

    values: dict[str, float] = {}

    for route, capacity in payload.items():
        if (
            isinstance(capacity, bool)
            or not isinstance(capacity, (int, float))
            or not math.isfinite(capacity)
            or capacity < 0
        ):
            raise HTTPException(
                status_code=422,
                detail=f"Capacity for {route} must be finite and non-negative",
            )

        values[route] = float(capacity)

    return values


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "C22 Returned Stock Recovery API", "docs": "/docs", "health": "/api/health"}


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/lots")
def list_lots():
    fixture = load_fixture()
    return {
        "case_id": fixture["case_id"],
        "data_version": fixture["data_version"],
        "currency": fixture["currency"],
        "lots": get_lots(fixture),
    }


@app.get("/api/assumptions")
def list_assumptions():
    return get_assumptions(load_fixture())


@app.post("/api/lots/validate")
def validate_lots(request: ValidateBatchRequest) -> dict[str, Any]:
    return validate_lot_batch(request.lots)


@app.post("/api/recovery/compare")
def recovery_compare(request: CompareRequest) -> dict[str, Any]:
    fixture = _fixture()

    try:
        return compare_lot(
            request.lot,
            {},
            _capacities(request.capacities, fixture),
            request.confidence_override,
            request.price_multiplier,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

@app.post("/api/proposals")
def save_proposal(request: ProposalRequest) -> dict[str, Any]:
    fixture = _fixture()
    try:
        capacities = _capacities(request.capacities, fixture)
        comparison = compare_lot(request.lot, {}, capacities,
                                 request.confidence_override, request.price_multiplier)
        scenario = {"price_multiplier": request.price_multiplier,
                    "inspection_confidence_override": request.confidence_override,
                    "route_results": comparison["routes"]}
        return create_reviewed_proposal(
            lot=request.lot,
            route=request.route,
            reviewer=request.reviewer,
            rationale=request.rationale,
            comparison=comparison,
            assumptions={},
            scenario=scenario,
            repository=repo,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/api/proposals")
def get_proposals() -> list[dict[str, Any]]:
    return repo.list_proposals()


@app.get("/api/variance")
def get_variance() -> dict[str, Any]:
    """Compare forecast net recovery with recorded realized outcomes."""
    proposals = repo.list_proposals()
    variance_rows = []

    for proposal in proposals:
        reviewed_route = proposal.get("reviewed_route")
        route_comparison = proposal.get("route_comparison") or []
        forecast = next(
            (
                route.get("expected_net_recovery")
                for route in route_comparison
                if route.get("route") == reviewed_route
            ),
            None,
        )
        outcomes = repo.list_outcomes(proposal["proposal_id"])

        if not outcomes:
            variance_rows.append({
                "proposal_id": proposal["proposal_id"],
                "lot_id": proposal.get("lot", {}).get("lot_id"),
                "reviewed_route": reviewed_route,
                "forecast_net_recovery": forecast,
                "realized_net_recovery": None,
                "variance": None,
                "outcome_id": None,
                "recorded_at_utc": None,
            })
            continue

        for outcome in outcomes:
            realized = outcome.get("realized_net_recovery")
            variance = (
                realized - forecast
                if isinstance(realized, (int, float))
                and not isinstance(realized, bool)
                and isinstance(forecast, (int, float))
                and not isinstance(forecast, bool)
                else None
            )
            variance_rows.append({
                "proposal_id": proposal["proposal_id"],
                "lot_id": proposal.get("lot", {}).get("lot_id"),
                "reviewed_route": reviewed_route,
                "forecast_net_recovery": forecast,
                "realized_net_recovery": realized,
                "variance": variance,
                "outcome_id": outcome.get("outcome_id"),
                "recorded_at_utc": outcome.get("recorded_at_utc"),
            })

    return {
        "count": len(variance_rows),
        "items": variance_rows,
        "disclaimer": (
            "Variance compares recorded realized net recovery with the "
            "forecast for the reviewed route. Recorded outcomes are not "
            "independently verified."
        ),
    }


@app.get("/api/proposals/{proposal_id}")
def get_proposal(proposal_id: str) -> dict[str, Any]:
    proposal = repo.get_proposal(proposal_id)
    if proposal is None:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return proposal


@app.patch("/api/proposals/{proposal_id}/status")
def update_proposal_status(proposal_id: str, request: StatusRequest) -> dict[str, Any]:
    try:
        proposal = repo.update_status(proposal_id, request.status)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if proposal is None:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return proposal


@app.post("/api/proposals/{proposal_id}/outcomes")
def add_outcome(proposal_id: str, request: OutcomeRequest) -> dict[str, Any]:
    try:
        return record_outcome(proposal_id=proposal_id,
            actual_gross_recovery=request.actual_gross_recovery,
            actual_processing_cost=request.actual_processing_cost,
            actual_handling_cost=request.actual_handling_cost,
            rework_units=request.rework_units, notes=request.notes, repository=repo)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/api/proposals/{proposal_id}/outcomes")
def get_outcomes(proposal_id: str) -> list[dict[str, Any]]:
    if repo.get_proposal(proposal_id) is None:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return repo.list_outcomes(proposal_id)
