# ReCoverIQ API contracts

Owner of the engine contract: **M1**. Proposal and outcome contract: **M2**. Error envelope: **M4**.
Change a field only by announcing it in the group chat and editing this file in the same commit.
All figures are **synthetic teaching data**. Money is INR. `null` means unknown, never zero.

## Shared shapes

```json
RouteResult = {
  "route": "resale | refurbish | scrap",
  "eligible": true,
  "reason": "plain-language sentence",
  "gross_recovery": 1000.0,
  "processing_cost": 200.0,
  "handling_cost": 50.0,
  "expected_net_recovery": 750.0,
  "scenario_low": 600.0,
  "scenario_high": 900.0
}
```
Blocked route: `eligible=false`, every number `null`, `reason` says why (for example `"Refurbish blocked: safety hold on this lot."`).

```json
Lot = { "lot_id": "L1", "quantity": 10, "category": "electronics", "condition": "good",
        "safety_hold": false, "inspection_confidence": 1.0 }
```
`inspection_confidence` may be `null` (inspection incomplete). `condition` may be `"unknown"`.

Error envelope (every failure, M4): `{ "error": { "code": "...", "message": "...", "hint": "...", "ref": "..." } }`

## M1 endpoints

### POST /api/evaluate
Request (assumptions optional, default from `backend/data/fixture.json`):
```json
{ "lot": { "lot_id": "L1", "quantity": 10, "category": "electronics", "condition": "good",
           "safety_hold": false, "inspection_confidence": 1.0 },
  "capacities": { "resale": 100, "refurbish": 100, "scrap": 100 },
  "confidence_override": null, "price_multiplier": 1.0 }
```
Response 200:
```json
{ "lot_id": "L1", "lot_problems": [],
  "results": [
    { "route": "resale", "eligible": true, "reason": "Resale permitted: expected net recovery is a scenario, not guaranteed.",
      "gross_recovery": 1000.0, "processing_cost": 0.0, "handling_cost": 50.0,
      "expected_net_recovery": 950.0, "scenario_low": 765.0, "scenario_high": 1050.0 },
    { "route": "refurbish", "eligible": true, "reason": "Refurbish permitted: expected net recovery is a scenario, not guaranteed.",
      "gross_recovery": 1000.0, "processing_cost": 200.0, "handling_cost": 50.0,
      "expected_net_recovery": 750.0, "scenario_low": 565.0, "scenario_high": 850.0 },
    { "route": "scrap", "eligible": true, "reason": "Scrap permitted: expected net recovery is a scenario, not guaranteed.",
      "gross_recovery": 100.0, "processing_cost": 0.0, "handling_cost": 0.0,
      "expected_net_recovery": 100.0, "scenario_low": 100.0, "scenario_high": 100.0 } ],
  "recommended_route": "resale",
  "incremental_value_vs_next_best": 200.0,
  "label": "Scenario, not guaranteed" }
```
(The low/high figures above are illustrative of the shape; the live values come from the API.)
If nothing is permitted: `recommended_route` is `null`.

### POST /api/allocate
Request: `{ "lots": [Lot, ...], "capacities": { "resale": 10, "refurbish": 100, "scrap": 100 } }`
Response 200:
```json
{ "allocations": [ { "lot_id": "L1", "units": 10, "route": "resale",
                     "result": { "...RouteResult..." }, "all_results": [ "...RouteResult x3..." ] } ],
  "unallocated": [ { "lot_id": "L2", "units": 10, "reason": "No permitted route with available capacity." } ],
  "total_expected_net_recovery": 950.0,
  "capacity_remaining": { "resale": 0, "refurbish": 100, "scrap": 100 },
  "label": "Scenario, not guaranteed" }
```
Allocation order: lots sorted by best net per unit (highest first), ties by `lot_id`. A lot goes whole to its best permitted route with capacity left, else cascades, else `unallocated`.

## M2 endpoints (shapes owned by M2; samples to be added by M2)
`GET /api/lots`, `POST /api/lots/import`, `POST/GET /api/proposals`, `GET /api/proposals/{id}`, `PATCH /api/proposals/{id}/status`, `POST/GET /api/outcomes`, `GET /api/variance`.

## M4 endpoint
`GET /api/health` returns `{ "status": "ok" }`.
