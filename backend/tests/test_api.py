"""Integration tests for the RecoverIQ API entry point."""

import json
import backend.api as api_module
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.repositories.proposal_repository import ProposalRepository
from backend.services.fixture_service import load_fixture, get_lots

@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client
@pytest.mark.parametrize(
    "field",
    [
        "actual_processing_cost",
        "actual_handling_cost",
    ],
)
def test_negative_outcome_costs_are_rejected(field, client):
    payload = {
        "actual_gross_recovery": 100,
        "actual_processing_cost": 10,
        "actual_handling_cost": 5,
        "rework_units": 0,
    }
    payload[field] = -1

    response = client.post(
        "/api/proposals/DOES-NOT-EXIST/outcomes",
        json=payload,
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"

def test_health_returns_success(client):
    """Health endpoint should return HTTP 200."""
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.headers.get("X-Request-ID")

    data = response.json()
    assert isinstance(data, dict)


def test_lots_returns_success(client):
    """Lots endpoint should return a successful response."""
    response = client.get("/api/lots")

    assert response.status_code == 200
    assert response.headers.get("X-Request-ID")


def test_unknown_api_route_returns_standard_error(client):
    """Unknown API routes should return the standard error envelope."""
    response = client.get("/api/does-not-exist")

    assert response.status_code == 404

    body = response.json()
    assert "error" in body

    error = body["error"]
    assert error["code"] == "API_NOT_FOUND"
    assert error["message"]
    assert error["hint"]
    assert error["ref"]


def test_validation_error_returns_standard_error(client):
    """A missing lot field should produce a structured 422 response."""
    response = client.post(
        "/api/recovery/compare",
        json={},
    )

    assert response.status_code == 422

    body = response.json()
    assert "error" in body

    error = body["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert error["message"]
    assert error["hint"]
    assert error["ref"]

    assert any(
        detail.get("location") == ["body", "lot"]
        for detail in error.get("details", [])
    )


def test_request_id_is_returned(client):
    """Each request should receive a request ID header."""
    first = client.get("/api/health")
    second = client.get("/api/health")

    first_id = first.headers.get("X-Request-ID")
    second_id = second.headers.get("X-Request-ID")

    assert first_id
    assert second_id
    assert first_id != second_id


def test_variance_endpoint_returns_expected_structure(client):
    response = client.get("/api/variance")

    assert response.status_code == 200

    body = response.json()
    assert isinstance(body["count"], int)
    assert isinstance(body["items"], list)
    assert "disclaimer" in body

    for item in body["items"]:
        assert "proposal_id" in item
        assert "forecast_net_recovery" in item
        assert "realized_net_recovery" in item
        assert "variance" in item


def test_record_outcome_for_unknown_proposal_returns_404(client):
    response = client.post(
        "/api/proposals/DOES-NOT-EXIST/outcomes",
        json={
            "actual_gross_recovery": 100,
            "actual_processing_cost": 10,
            "actual_handling_cost": 5,
            "rework_units": 0,
            "notes": "Synthetic QA test",
        },
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "API_NOT_FOUND"


def test_get_outcomes_for_unknown_proposal_returns_404(client):
    response = client.get("/api/proposals/DOES-NOT-EXIST/outcomes")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "API_NOT_FOUND"


def test_negative_gross_recovery_is_rejected(client):
    response = client.post(
        "/api/proposals/DOES-NOT-EXIST/outcomes",
        json={
            "actual_gross_recovery": -1,
            "actual_processing_cost": 0,
            "actual_handling_cost": 0,
            "rework_units": 0,
        },
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_missing_required_outcome_field_is_rejected(client):
    response = client.post(
        "/api/proposals/DOES-NOT-EXIST/outcomes",
        json={
            "actual_gross_recovery": 100,
            "actual_processing_cost": 10,
        },
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
def test_negative_rework_units_are_rejected(client):
    response = client.post(
        "/api/proposals/DOES-NOT-EXIST/outcomes",
        json={
            "actual_gross_recovery": 100,
            "actual_processing_cost": 10,
            "actual_handling_cost": 5,
            "rework_units": -1,
        },
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.parametrize(
    "field",
    [
        "actual_gross_recovery",
        "actual_processing_cost",
        "actual_handling_cost",
    ],
)
@pytest.mark.parametrize(
    "invalid_value",
    [
        float("nan"),
        float("inf"),
        float("-inf"),
    ],
)
def test_non_finite_outcome_values_are_rejected(
    field, invalid_value, client
):
    payload = {
        "actual_gross_recovery": 100,
        "actual_processing_cost": 10,
        "actual_handling_cost": 5,
        "rework_units": 0,
    }
    payload[field] = invalid_value

    response = client.post(
        "/api/proposals/DOES-NOT-EXIST/outcomes",
        content=json.dumps(payload, allow_nan=True),
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
def test_zero_value_outcome_is_recorded_correctly(
    client, tmp_path, monkeypatch
):
    # Use an isolated database so existing demo data is untouched.
    test_repo = ProposalRepository(tmp_path / "zero_outcome_test.sqlite3")
    monkeypatch.setattr(api_module, "repo", test_repo)

    # Select a real lot from the existing synthetic fixture.
    fixture = load_fixture()
    lots = get_lots(fixture)
    lot = next(
        item for item in lots
        if item.get("lot_id") == "L1"
    )

    # Compare recovery routes to determine a route eligible for a proposal.
    comparison_response = client.post(
        "/api/recovery/compare",
        json={"lot": lot},
    )
    assert comparison_response.status_code == 200

    comparison = comparison_response.json()
    eligible_routes = [
        item["route"]
        for item in comparison["routes"]
        if item["eligible"]
    ]
    assert eligible_routes, "Expected at least one eligible recovery route"

    # Create a proposal using the first eligible route.
    proposal_response = client.post(
        "/api/proposals",
        json={
            "lot": lot,
            "route": eligible_routes[0],
            "reviewer": "QA Test",
            "rationale": "Isolated zero-value outcome test",
        },
    )
    assert proposal_response.status_code == 200

    proposal = proposal_response.json()
    proposal_id = proposal["proposal_id"]

    # Record zero recovery and zero actual costs.
    outcome_response = client.post(
        f"/api/proposals/{proposal_id}/outcomes",
        json={
            "actual_gross_recovery": 0,
            "actual_processing_cost": 0,
            "actual_handling_cost": 0,
            "rework_units": 0,
            "notes": "Synthetic zero-value QA test",
        },
    )
    assert outcome_response.status_code == 200

    outcome = outcome_response.json()
    assert outcome["realized_net_recovery"] == 0
    assert outcome["actual_gross_recovery"] == 0
    assert outcome["actual_processing_cost"] == 0
    assert outcome["actual_handling_cost"] == 0

    # Verify variance uses the proposal's actual forecast.
    variance_response = client.get("/api/variance")
    assert variance_response.status_code == 200

    matching_rows = [
        item
        for item in variance_response.json()["items"]
        if item["proposal_id"] == proposal_id
    ]
    assert len(matching_rows) == 1

    row = matching_rows[0]
    assert row["realized_net_recovery"] == 0
    assert row["variance"] == -row["forecast_net_recovery"]