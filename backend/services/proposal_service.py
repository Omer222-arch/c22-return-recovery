"""Workflow rules for reviewed proposals and realized outcomes."""
from __future__ import annotations

from datetime import datetime, timezone
from math import isfinite
from typing import Any
from uuid import uuid4

from engine import ROUTES, best_permitted_route, evaluate_all
from backend.repositories.proposal_repository import ProposalRepository
from backend.services.validation_service import validate_lot_record


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _finite_nonnegative(value: Any, name: str) -> float:
    if isinstance(value, bool):
        raise ValueError(f"{name} must be a finite non-negative number")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} must be a finite non-negative number") from exc
    if not isfinite(number) or number < 0:
        raise ValueError(f"{name} must be a finite non-negative number")
    return number


def compare_lot(
    lot: dict[str, Any],
    assumptions: dict[str, Any] | None = None,
    capacities: dict[str, float] | None = None,
    confidence_override: float | None = None,
    price_multiplier: float = 1.0,
) -> dict[str, Any]:
    errors = validate_lot_record(lot)
    if errors:
        raise ValueError("Invalid lot: " + "; ".join(errors))

    results = evaluate_all(
        lot,
        assumptions=assumptions,
        capacities=capacities,
        confidence_override=confidence_override,
        price_multiplier=price_multiplier,
    )

    rows = []
    for result in results:
        rows.append({
            "route": result.route,
            "eligible": result.eligible,
            "reason": result.reason,
            "gross_recovery": result.gross_recovery,
            "processing_cost": result.processing_cost,
            "handling_cost": result.handling_cost,
            "expected_net_recovery": result.expected_net_recovery,
            "scenario_low": result.scenario_low,
            "scenario_high": result.scenario_high,
        })

    best = best_permitted_route(results)

    return {
        "lot_id": lot["lot_id"],
        "routes": rows,
        "recommendation": best.route if best else None,
        "disclaimer": (
            "Scenario estimates only; not guaranteed or realized recovery. "
            "Unknown values remain unknown."
        ),
    }

def create_reviewed_proposal(*, lot: dict[str, Any], route: str, reviewer: str, rationale: str,
                             comparison: dict[str, Any], assumptions: dict[str, Any],
                             scenario: dict[str, Any], repository: ProposalRepository) -> dict[str, Any]:
    if route not in ROUTES:
        raise ValueError(f"Unsupported route: {route}")
    if not isinstance(reviewer, str) or not reviewer.strip():
        raise ValueError("reviewer is required")
    if not isinstance(rationale, str) or not rationale.strip():
        raise ValueError("rationale is required")
    route_result = next((r for r in comparison["routes"] if r["route"] == route), None)
    if not route_result or not route_result["eligible"]:
        reason = route_result["reason"] if route_result else "Route was not evaluated"
        raise ValueError(f"Cannot save proposal for an ineligible route: {reason}")
    proposal = {
        "proposal_id": f"C22-{uuid4().hex[:12].upper()}",
        "created_at_utc": utc_now(),
        "status": "reviewed",
        "lot": lot,
        "reviewed_route": route,
        "reviewer": reviewer.strip(),
        "rationale": rationale.strip(),
        "assumptions": assumptions.get(route, {}),
        "scenario": scenario,
        "route_comparison": comparison["routes"],
        "reviewed": True,
        "disclaimer": "Reviewed proposal only. Not an approval or execution instruction; forecast is not realized recovery.",
    }
    return repository.create_proposal(proposal)


def record_outcome(*, proposal_id: str, actual_gross_recovery: Any,
                   actual_processing_cost: Any, actual_handling_cost: Any,
                   rework_units: Any = 0, notes: str = "",
                   repository: ProposalRepository) -> dict[str, Any]:
    proposal = repository.get_proposal(proposal_id)
    if proposal is None:
        raise LookupError(f"Proposal '{proposal_id}' was not found")
    gross = _finite_nonnegative(actual_gross_recovery, "actual_gross_recovery")
    processing = _finite_nonnegative(actual_processing_cost, "actual_processing_cost")
    handling = _finite_nonnegative(actual_handling_cost, "actual_handling_cost")
    if isinstance(rework_units, bool) or not isinstance(rework_units, int) or rework_units < 0:
        raise ValueError("rework_units must be a non-negative integer")
    if not isinstance(notes, str):
        raise ValueError("notes must be a string")
    outcome = {
        "outcome_id": f"OUT-{uuid4().hex[:12].upper()}",
        "proposal_id": proposal_id,
        "recorded_at_utc": utc_now(),
        "actual_gross_recovery": gross,
        "actual_processing_cost": processing,
        "actual_handling_cost": handling,
        "realized_net_recovery": gross - processing - handling,
        "rework_units": rework_units,
        "notes": notes.strip(),
        "basis": "User-recorded actual outcome; not independently verified by the application.",
    }
    return repository.create_outcome(outcome)
