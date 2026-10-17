"""M1: HTTP layer for the engine. Thin wrapper; all logic stays in engine.py."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

import engine

router = APIRouter(prefix="/api", tags=["engine"])
FIXTURE = Path(__file__).parent / "data" / "fixture.json"


def _error(status: int, code: str, message: str, hint: str) -> JSONResponse:
    # M4's handler in main.py adds the real ref id for unexpected failures; this covers user errors here.
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message, "hint": hint, "ref": None}})


def _assumptions(supplied: Optional[dict]) -> Optional[dict]:
    if supplied:
        return supplied
    try:
        return json.loads(FIXTURE.read_text(encoding="utf-8")).get("assumptions")
    except (OSError, ValueError):
        return None


class EvaluateRequest(BaseModel):
    lot: dict[str, Any]
    assumptions: Optional[dict[str, Any]] = None
    capacities: Optional[dict[str, Optional[float]]] = None
    confidence_override: Optional[float] = None
    price_multiplier: float = Field(default=1.0)


class AllocateRequest(BaseModel):
    lots: list[dict[str, Any]]
    capacities: dict[str, Optional[float]]
    assumptions: Optional[dict[str, Any]] = None


@router.post("/evaluate")
def evaluate(req: EvaluateRequest):
    a = _assumptions(req.assumptions)
    if a is None:
        return _error(500, "assumptions_unavailable", "Assumption table could not be loaded.",
                      "Check backend/data/fixture.json exists and is valid JSON.")
    problems = engine.validate_lot(req.lot)
    results = engine.evaluate_all(req.lot, a, req.capacities, req.confidence_override, req.price_multiplier)
    best = engine.best_permitted_route(results)
    return engine.to_json_safe({
        "lot_id": req.lot.get("lot_id"),
        "lot_problems": problems,
        "results": results,
        "recommended_route": best.route if best else None,
        "incremental_value_vs_next_best": engine.incremental_value_vs_next_best(results),
        "label": "Scenario, not guaranteed",
    })


@router.post("/allocate")
def allocate(req: AllocateRequest):
    a = _assumptions(req.assumptions)
    if a is None:
        return _error(500, "assumptions_unavailable", "Assumption table could not be loaded.",
                      "Check backend/data/fixture.json exists and is valid JSON.")
    return engine.to_json_safe(engine.allocate_lots(req.lots, a, req.capacities))
