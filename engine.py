"""Deterministic recovery rules for the official C22 v3.2 fixture."""
from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from typing import Any

ROUTES = ("resale", "refurbish", "scrap")


@dataclass
class RouteResult:
    route: str
    eligible: bool
    reason: str
    gross_recovery: float | None
    processing_cost: float | None
    handling_cost: float | None
    expected_net_recovery: float | None
    scenario_low: float | None
    scenario_high: float | None


def validate_lot(lot: dict[str, Any]) -> list[str]:
    """Validate a lot against the C22 record schema."""
    from backend.services.validation_service import validate_lot_record

    return validate_lot_record(lot)


def _money(value: Any, field: str) -> float:
    """Validate a known, finite, non-negative monetary or capacity value."""
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not isfinite(value)
        or value < 0
    ):
        raise ValueError(
            f"{field} must be a known, finite, non-negative number"
        )

    return float(value)


def evaluate_route(
    lot: dict[str, Any],
    route: str,
    assumptions: dict[str, Any] | None = None,
    capacity_remaining: float | None = None,
    confidence_override: float | None = None,
    price_multiplier: float = 1.0,
) -> RouteResult:
    """Evaluate one recovery route using the official C22 lot fields.

    Monetary values are currently interpreted using the existing engine's
    per-unit calculation. Confirm the monetary-field units before relying on
    the resulting totals for operational decisions.

    Approved inspection is an application eligibility rule for resale and
    refurbish; pending inspection is not treated as approved.
    """
    if route not in ROUTES:
        raise ValueError(f"Unknown route: {route}")

    errors = validate_lot(lot)
    if errors:
        raise ValueError("Invalid lot: " + "; ".join(errors))

    # Kept for compatibility with existing callers. The official C22 fixture
    # does not supply the old starter assumptions structure.
    _ = assumptions

    # The official fixture has no confidence field or confidence model.
    # Do not pretend that an override changes expected recovery.
    if confidence_override is not None:
        if (
            isinstance(confidence_override, bool)
            or not isinstance(confidence_override, (int, float))
            or not isfinite(confidence_override)
            or not 0 <= confidence_override <= 1
        ):
            raise ValueError("confidence_override must be between 0 and 1")

    reasons: list[str] = []
    inspection = lot["inspection"]

    if route in ("resale", "refurbish") and inspection != "approved":
        reasons.append(
            f"{route} requires approved inspection; current inspection is "
            f"{inspection!r}"
        )

    if capacity_remaining is not None:
        capacity = _money(capacity_remaining, "capacity_remaining")
        if lot["units"] > capacity:
            reasons.append(
                f"Capacity exceeded: lot units {lot['units']}, "
                f"remaining capacity {capacity:g}"
            )

    if (
        isinstance(price_multiplier, bool)
        or not isinstance(price_multiplier, (int, float))
        or not isfinite(price_multiplier)
        or price_multiplier <= 0
        or price_multiplier > 5
    ):
        raise ValueError("price_multiplier must be greater than 0 and at most 5")

    units = lot["units"]

    price_field = (
        "scrap_recovery_inr" if route == "scrap" else "resale_price_inr"
    )

    price = lot.get(price_field)
    handling = lot.get("handling_inr")
    refurbishment = lot.get("refurbishment_inr")

    processing: float | None = 0.0
    if route == "refurbish":
        processing = refurbishment

    required = [price, handling, processing]
    known = all(value is not None for value in required)

    if not known:
        reasons.append("Required recovery or cost values are unknown")

    eligible = not reasons

    gross: float | None = None
    processing_total: float | None = None
    handling_total: float | None = None
    net: float | None = None

    if known:
        unit_price = _money(price, price_field) * float(price_multiplier)
        unit_processing = _money(processing, "refurbishment_inr")
        unit_handling = _money(handling, "handling_inr")

        gross = units * unit_price
        processing_total = units * unit_processing
        handling_total = units * unit_handling
        net = gross - processing_total - handling_total

    return RouteResult(
        route=route,
        eligible=eligible,
        reason="; ".join(reasons) if reasons else "Eligible",
        gross_recovery=gross,
        processing_cost=processing_total,
        handling_cost=handling_total,
        expected_net_recovery=net,
        scenario_low=None,
        scenario_high=None,
    )


def evaluate_all(
    lot: dict[str, Any],
    assumptions: dict[str, Any] | None = None,
    capacities: dict[str, float] | None = None,
    confidence_override: float | None = None,
    price_multiplier: float = 1.0,
) -> list[RouteResult]:
    """Evaluate all supported routes."""
    capacities = capacities or {}

    return [
        evaluate_route(
            lot,
            route,
            assumptions=assumptions,
            capacity_remaining=capacities.get(route),
            confidence_override=confidence_override,
            price_multiplier=price_multiplier,
        )
        for route in ROUTES
    ]


def best_permitted_route(
    results: list[RouteResult],
) -> RouteResult | None:
    """Return the eligible route with the highest known expected net."""
    permitted = [
        result
        for result in results
        if result.eligible and result.expected_net_recovery is not None
    ]

    return (
        max(permitted, key=lambda result: result.expected_net_recovery)
        if permitted
        else None
    )