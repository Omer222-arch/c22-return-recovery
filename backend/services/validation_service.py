"""Validation for official C22 v3.2 lot records."""
from __future__ import annotations

import math
from typing import Any

LOT_NUMERIC_FIELDS = (
    "units",
    "refurbishment_inr",
    "handling_inr",
    "resale_price_inr",
    "scrap_recovery_inr",
)

REQUIRED_LOT_FIELDS = (
    "lot_id",
    "units",
    "inspection",
    "refurbishment_inr",
    "handling_inr",
    "resale_price_inr",
    "scrap_recovery_inr",
)

VALID_INSPECTIONS = {"approved", "pending"}


def validate_lot_record(lot: Any) -> list[str]:
    if not isinstance(lot, dict):
        return ["Each lot record must be a JSON object"]

    errors: list[str] = []

    for field in REQUIRED_LOT_FIELDS:
        if field not in lot:
            errors.append(f"Missing required field '{field}'")

    lot_id = lot.get("lot_id")
    if not isinstance(lot_id, str) or not lot_id.strip():
        errors.append("lot_id must be a non-empty string")

    inspection = lot.get("inspection")
    if inspection is not None and inspection not in VALID_INSPECTIONS:
        errors.append("inspection must be 'approved' or 'pending'")

    units = lot.get("units")
    if (
        isinstance(units, bool)
        or not isinstance(units, int)
        or units < 1
    ):
        errors.append("units must be a positive integer")

    for field in LOT_NUMERIC_FIELDS[1:]:
        value = lot.get(field)

        # Null means unknown; it must not be silently changed to zero.
        if value is None:
            continue

        if (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(value)
            or value < 0
        ):
            errors.append(f"{field} must be null or a finite non-negative number")

    return errors


def validate_lot_batch(records: Any) -> dict[str, Any]:
    """Validate a batch and flag repeated lot IDs."""
    if not isinstance(records, list):
        return {
            "valid": [],
            "invalid": [],
            "errors": ["Expected a list of lot records"],
        }

    seen: set[str] = set()
    valid: list[dict[str, Any]] = []
    invalid: list[dict[str, Any]] = []

    for index, record in enumerate(records):
        errors = validate_lot_record(record)

        if isinstance(record, dict):
            lot_id = record.get("lot_id")
            if isinstance(lot_id, str) and lot_id.strip():
                lot_id = lot_id.strip()
                if lot_id in seen:
                    errors.append(
                        f"Duplicate lot_id '{lot_id}' in import batch"
                    )
                else:
                    seen.add(lot_id)

        item = {
            "index": index,
            "record": record,
            "errors": list(dict.fromkeys(errors)),
        }
        (invalid if item["errors"] else valid).append(item)

    return {"valid": valid, "invalid": invalid, "errors": []}