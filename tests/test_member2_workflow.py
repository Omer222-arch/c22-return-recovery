import json

import pytest
from fastapi.testclient import TestClient

from backend.api import app
from backend.repositories.proposal_repository import ProposalRepository
from backend.services.fixture_service import load_fixture
from backend.services.proposal_service import compare_lot, create_reviewed_proposal, record_outcome
from backend.services.validation_service import validate_lot_batch


@pytest.fixture

def fixture_data():
    return load_fixture()


def test_official_fixture_is_valid(fixture_data):
    assert fixture_data["case_id"] == "C22"
    assert fixture_data["data_version"] == "v3.2"
    assert fixture_data["currency"] == "INR unless explicitly stated"
    assert fixture_data["missing_values"] == "null means unknown, never zero"

    records = fixture_data["records"]
    lots = records["lots"]

    assert len(lots) == 6
    assert [lot["lot_id"] for lot in lots] == [
        "L1", "L2", "L3", "L4", "L5", "L6"
    ]

    assert records["expected_per_unit_recovery_inr"] == 630

    pending_lots = [
        lot["lot_id"]
        for lot in lots
        if lot["inspection"] == "pending"
    ]
    assert pending_lots == ["L5"]


def test_batch_validation_flags_duplicate_ids(fixture_data):
    lots = [
        fixture_data["records"]["lots"][0],
        dict(fixture_data["records"]["lots"][0]),
    ]
    result = validate_lot_batch(lots)

    assert len(result["valid"]) == 1
    assert len(result["invalid"]) == 1
    assert "Duplicate lot_id" in " ".join(result["invalid"][0]["errors"])


def test_batch_validation_rejects_non_objects():
    result = validate_lot_batch(["not-a-lot", None])
    assert len(result["invalid"]) == 2


def test_compare_never_serializes_nan_for_ineligible_routes(fixture_data):
    lot = next(
        x for x in fixture_data["records"]["lots"]
        if x["lot_id"] == "L5"
    )

    comparison = compare_lot(lot)
    encoded = json.dumps(comparison, allow_nan=False)

    assert "NaN" not in encoded
    assert any(not route["eligible"] for route in comparison["routes"])


def test_proposal_requires_eligible_route_and_persists(tmp_path, fixture_data):
    repository = ProposalRepository(tmp_path / "workflow.sqlite3")

    lot = next(
        x for x in fixture_data["records"]["lots"]
        if x["lot_id"] == "L1"
    )

    comparison = compare_lot(lot)

    eligible_routes = [
        item["route"]
        for item in comparison["routes"]
        if item["eligible"]
    ]

    assert eligible_routes, "Expected at least one eligible route"

    route = eligible_routes[0]

    proposal = create_reviewed_proposal(
        lot=lot,
        route=route,
        reviewer="QA",
        rationale="Testing proposal persistence",
        comparison=comparison,
        assumptions={},
        scenario={},
        repository=repository,
    )

    assert proposal["reviewed_route"] == route
    assert proposal["reviewer"] == "QA"
    assert proposal["status"] == "reviewed"

    saved_proposals = repository.list_proposals()
    assert any(
        item["proposal_id"] == proposal["proposal_id"]
        for item in saved_proposals
    )


def test_proposal_rejects_ineligible_route(tmp_path, fixture_data):
    repository = ProposalRepository(tmp_path / "workflow.sqlite3")

    lot = next(
        x for x in fixture_data["records"]["lots"]
        if x["lot_id"] == "L5"
    )

    comparison = compare_lot(lot)

    with pytest.raises(ValueError, match="ineligible"):
        create_reviewed_proposal(
            lot=lot,
            route="resale",
            reviewer="QA",
            rationale="Pending inspection must not be resold",
            comparison=comparison,
            assumptions={},
            scenario={},
            repository=repository,
        )


def test_outcome_links_to_proposal_and_calculates_realized_net(
    tmp_path, fixture_data
):
    repository = ProposalRepository(tmp_path / "workflow.sqlite3")

    lot = next(
        x for x in fixture_data["records"]["lots"]
        if x["lot_id"] == "L1"
    )

    comparison = compare_lot(lot)

    eligible_routes = [
        item["route"]
        for item in comparison["routes"]
        if item["eligible"]
    ]
    assert eligible_routes, "Expected at least one eligible route"

    route = eligible_routes[0]

    proposal = create_reviewed_proposal(
        lot=lot,
        route=route,
        reviewer="QA",
        rationale="Pilot outcome test",
        comparison=comparison,
        assumptions={},
        scenario={},
        repository=repository,
    )

    outcome = record_outcome(
        proposal_id=proposal["proposal_id"],
        actual_gross_recovery=900,
        actual_processing_cost=100,
        actual_handling_cost=50,
        rework_units=1,
        notes="Sample outcome",
        repository=repository,
    )

    assert outcome["realized_net_recovery"] == 750

    saved_outcomes = repository.list_outcomes(proposal["proposal_id"])
    assert saved_outcomes[0]["outcome_id"] == outcome["outcome_id"]


def test_outcome_requires_existing_proposal(tmp_path):
    repository = ProposalRepository(tmp_path / "workflow.sqlite3")
    with pytest.raises(LookupError):
        record_outcome(proposal_id="missing", actual_gross_recovery=1, actual_processing_cost=0,
            actual_handling_cost=0, repository=repository)
def test_api_recovery_compare_returns_valid_route_comparison(fixture_data):
    client = TestClient(app)

    lot = next(
        item
        for item in fixture_data["records"]["lots"]
        if item["lot_id"] == "L1"
    )

    response = client.post(
        "/api/recovery/compare",
        json={"lot": lot},
    )

    assert response.status_code == 200, response.text

    result = response.json()

    assert result["lot_id"] == "L1"
    assert result["recommendation"] in {"resale", "refurbish", "scrap"}
    assert len(result["routes"]) == 3

    routes = {item["route"]: item for item in result["routes"]}
    assert set(routes) == {"resale", "refurbish", "scrap"}

    # L1 is approved under the current engine rules.
    assert all(item["eligible"] for item in routes.values())

    # Provisional calculations assume monetary fields are per-unit.
    assert routes["resale"]["expected_net_recovery"] == pytest.approx(3650)
    assert routes["refurbish"]["expected_net_recovery"] == pytest.approx(3150)
    assert routes["scrap"]["expected_net_recovery"] == pytest.approx(300)

    # Ensure the response contains strict JSON-compatible values.
    json.dumps(result, allow_nan=False)

    assert "not guaranteed" in result["disclaimer"].lower()

def test_api_validates_lots():
    client = TestClient(app)

    response = client.post(
        "/api/lots/validate",
        json={
            "lots": [
                {
                    "lot_id": "X",
                    "units": 1,
                    "inspection": "approved",
                    "refurbishment_inr": 100,
                    "handling_inr": 20,
                    "resale_price_inr": 750,
                    "scrap_recovery_inr": 80,
                }
            ]
        },
    )

    assert response.status_code == 200
    assert len(response.json()["valid"]) == 1
    assert len(response.json()["invalid"]) == 0


def test_api_validates_lots():
    client = TestClient(app)

    response = client.post(
        "/api/lots/validate",
        json={
            "lots": [
                {
                    "lot_id": "X",
                    "units": 1,
                    "inspection": "approved",
                    "refurbishment_inr": 100,
                    "handling_inr": 20,
                    "resale_price_inr": 750,
                    "scrap_recovery_inr": 80,
                }
            ]
        },
    )

    assert response.status_code == 200
    assert len(response.json()["valid"]) == 1
    assert len(response.json()["invalid"]) == 0