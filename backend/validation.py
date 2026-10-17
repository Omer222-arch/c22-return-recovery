
from typing import Any

REQUIRED_FIELDS = (
    "lot_id",
    "units",
    "inspection",
    "refurbishment_inr",
    "handling_inr",
    "resale_price_inr",
    "scrap_recovery_inr",
)

VALID_INSPECTIONS = {"approved", "pending", "rejected"}

MONEY_FIELDS = (
    "refurbishment_inr",
    "handling_inr",
    "resale_price_inr",
    "scrap_recovery_inr",
)


def validate_lots(data: Any) -> dict:
    """
    Validate a list of recovery lots.

    Null monetary values mean unknown, not zero.
    Returns normalized valid lots and a list of issues.
    """

    issues = []
    valid_lots = []
    seen_ids = set()

    if not isinstance(data, list):
        return {
            "valid": False,
            "lots": [],
            "issues": [
                {
                    "row": 0,
                    "field": "data",
                    "severity": "error",
                    "message": "Expected a list of lots.",
                }
            ],
        }

    for row_number, item in enumerate(data, start=1):
        row_errors = []

        if not isinstance(item, dict):
            issues.append({
                "row": row_number,
                "field": "row",
                "severity": "error",
                "message": "Each lot must be an object.",
            })
            continue

        for field in REQUIRED_FIELDS:
            if field not in item:
                row_errors.append({
                    "row": row_number,
                    "field": field,
                    "severity": "error",
                    "message": f"Missing required field: {field}.",
                })

        lot_id = item.get("lot_id")

        if not isinstance(lot_id, str) or not lot_id.strip():
            row_errors.append({
                "row": row_number,
                "field": "lot_id",
                "severity": "error",
                "message": "Lot ID must be a non-empty string.",
            })
        elif lot_id.strip() in seen_ids:
            row_errors.append({
                "row": row_number,
                "field": "lot_id",
                "severity": "error",
                "message": f"Duplicate lot ID: {lot_id.strip()}.",
            })
        else:
            seen_ids.add(lot_id.strip())

        units = item.get("units")

        if (
            isinstance(units, bool)
            or not isinstance(units, int)
            or units <= 0
        ):
            row_errors.append({
                "row": row_number,
                "field": "units",
                "severity": "error",
                "message": "Units must be a positive integer.",
            })

        inspection = item.get("inspection")

        if inspection not in VALID_INSPECTIONS:
            row_errors.append({
                "row": row_number,
                "field": "inspection",
                "severity": "error",
                "message": (
                    "Inspection must be approved, pending, or rejected."
                ),
            })

        for field in MONEY_FIELDS:
            value = item.get(field)

            if value is None:
                issues.append({
                    "row": row_number,
                    "field": field,
                    "severity": "warning",
                    "message": (
                        f"{field} is unknown; it will not be treated as zero."
                    ),
                })
            elif (
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or value < 0
            ):
                row_errors.append({
                    "row": row_number,
                    "field": field,
                    "severity": "error",
                    "message": (
                        f"{field} must be a non-negative number or null."
                    ),
                })

        issues.extend(row_errors)

        if not row_errors:
            normalized = dict(item)
            normalized["lot_id"] = lot_id.strip()
            valid_lots.append(normalized)

    has_errors = any(
        issue["severity"] == "error" for issue in issues
    )

    return {
        "valid": not has_errors,
        "lots": valid_lots if not has_errors else [],
        "issues": issues,
    }
