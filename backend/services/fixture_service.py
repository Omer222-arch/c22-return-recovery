import json
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_FIXTURE_PATH = PROJECT_ROOT / "data" / "fixture.json"


def load_fixture(path: str | Path = DEFAULT_FIXTURE_PATH) -> dict[str, Any]:
    """Load and validate the authoritative C22 fixture without changing its schema."""
    fixture_path = Path(path)

    try:
        payload = json.loads(fixture_path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ValueError(f"Could not read fixture: {fixture_path}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"Fixture is not valid JSON: {exc.msg}") from exc

    if not isinstance(payload, dict):
        raise ValueError("Fixture root must be a JSON object")

    if payload.get("case_id") != "C22":
        raise ValueError("Expected C22 dataset")

    if payload.get("data_version") != "v3.2":
        raise ValueError("Expected C22 data version v3.2")

    if not isinstance(payload.get("records"), dict):
        raise ValueError("Fixture must contain a 'records' object")

    lots = payload["records"].get("lots")

    if not isinstance(lots, list):
        raise ValueError("Fixture must contain a 'records.lots' list")

    if not isinstance(payload.get("public_checks"), list):
        raise ValueError("Fixture must contain a 'public_checks' list")

    lot_ids = set()

    for index, lot in enumerate(lots):
        if not isinstance(lot, dict):
            raise ValueError(f"Lot at index {index} must be an object")

        lot_id = lot.get("lot_id")

        if not isinstance(lot_id, str) or not lot_id:
            raise ValueError(f"Lot at index {index} must have a lot_id")

        if lot_id in lot_ids:
            raise ValueError(f"Duplicate lot_id: {lot_id}")

        lot_ids.add(lot_id)

        units = lot.get("units")

        if isinstance(units, bool) or not isinstance(units, int) or units < 0:
            raise ValueError(f"Lot {lot_id}: units must be a non-negative integer")

        if lot.get("inspection") not in {"approved", "pending"}:
            raise ValueError(f"Lot {lot_id}: unsupported inspection status")

        # Preserve null as unknown; never silently replace it with zero.
        for field in (
            "refurbishment_inr",
            "handling_inr",
            "resale_price_inr",
            "scrap_recovery_inr",
        ):
            value = lot.get(field)

            if value is not None and (
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or value < 0
            ):
                raise ValueError(
                    f"Lot {lot_id}: {field} must be non-negative or null"
                )

    return payload


def get_lots(payload: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Return the original lot records from C22 v3.2."""
    if payload is None:
        payload = load_fixture()

    return payload["records"]["lots"]


def get_assumptions(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    """Return metadata and economics without inventing an assumptions schema."""
    if payload is None:
        payload = load_fixture()

    return {
        "case_id": payload["case_id"],
        "data_version": payload["data_version"],
        "currency": payload["currency"],
        "missing_values": payload["missing_values"],
        "expected_per_unit_recovery_inr": (
            payload["records"].get("expected_per_unit_recovery_inr")
        ),
        "notes": payload["records"].get("notes"),
        "worked_example": payload["records"].get("worked_example"),
        "public_checks": payload["public_checks"],
        "limit": payload.get("limit"),
    }