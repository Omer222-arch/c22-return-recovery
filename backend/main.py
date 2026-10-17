"""
RecoverIQ application entry point.

Member 4: Business, QA and Delivery Lead.

This module exposes the existing API through a production-oriented
FastAPI application entry point.

Run locally:
    python -m uvicorn backend.main:app --host 127.0.0.1 --port 8080

Existing compatibility entry point:
    python -m uvicorn backend.api:app --host 127.0.0.1 --port 8080
"""

from __future__ import annotations

import logging
import os
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.api import app as existing_app


logger = logging.getLogger("recoveriq.api")

if not logging.getLogger().handlers:
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


app: FastAPI = existing_app


@app.middleware("http")
async def request_logging_middleware(
    request: Request,
    call_next: Any,
):
    """Log requests and attach a reference ID to the response."""

    reference_id = str(uuid.uuid4())
    request.state.reference_id = reference_id

    started_at = time.perf_counter()

    try:
        response = await call_next(request)
        response.headers["X-Request-ID"] = reference_id

        elapsed_ms = (time.perf_counter() - started_at) * 1000
        logger.info(
            "request_id=%s method=%s path=%s status=%s duration_ms=%.2f",
            reference_id,
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
        )

        return response

    except Exception:
        elapsed_ms = (time.perf_counter() - started_at) * 1000
        logger.exception(
            "request_id=%s method=%s path=%s status=500 duration_ms=%.2f",
            reference_id,
            request.method,
            request.url.path,
            elapsed_ms,
        )

        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": "An unexpected server error occurred.",
                    "hint": "Retry the request. If the problem persists, "
                    "provide the reference ID to the project team.",
                    "ref": reference_id,
                }
            },
            headers={"X-Request-ID": reference_id},
        )


def _error_response(
    request: Request,
    *,
    status_code: int,
    code: str,
    message: str,
    hint: str,
    details: Any = None,
) -> JSONResponse:
    """Create a consistent JSON error envelope."""

    reference_id = getattr(request.state, "reference_id", str(uuid.uuid4()))
    error: dict[str, Any] = {
        "code": code,
        "message": message,
        "hint": hint,
        "ref": reference_id,
    }

    if details is not None:
        error["details"] = details

    return JSONResponse(
        status_code=status_code,
        content={"error": error},
        headers={"X-Request-ID": reference_id},
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(
    request: Request,
    exc: StarletteHTTPException,
) -> JSONResponse:
    """Return a standard JSON envelope for HTTP errors."""

    if exc.status_code == 404:
        path = request.url.path

        if path.startswith("/api/"):
            return _error_response(
                request,
                status_code=404,
                code="API_NOT_FOUND",
                message="The requested API endpoint was not found.",
                hint="Check the endpoint path and HTTP method.",
            )

        return _error_response(
            request,
            status_code=404,
            code="NOT_FOUND",
            message="The requested resource was not found.",
            hint="Check the URL and try again.",
        )

    return _error_response(
        request,
        status_code=exc.status_code,
        code="HTTP_ERROR",
        message=str(exc.detail),
        hint="Check the request and try again.",
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    """Return a consistent response for invalid request data."""

    details = [
        {
            "location": list(error.get("loc", [])),
            "message": error.get("msg", "Invalid value"),
            "type": error.get("type", "validation_error"),
        }
        for error in exc.errors()
    ]

    return _error_response(
        request,
        status_code=422,
        code="VALIDATION_ERROR",
        message="The request contains invalid or missing fields.",
        hint="Review the reported fields and correct the request.",
        details=details,
    )


@app.exception_handler(Exception)
async def unexpected_exception_handler(
    request: Request,
    exc: Exception,
) -> JSONResponse:
    """Handle unexpected application errors without exposing internals."""

    reference_id = getattr(request.state, "reference_id", "unavailable")
    logger.exception(
        "Unhandled application exception; request_id=%s",
        reference_id,
    )

    return _error_response(
        request,
        status_code=500,
        code="INTERNAL_SERVER_ERROR",
        message="An unexpected server error occurred.",
        hint="Retry the request and provide the reference ID if the problem persists.",
    )


FRONTEND_DIST = (
    Path(__file__).resolve().parent.parent / "frontend" / "dist"
)

if os.getenv("SERVE_FRONTEND", "false").lower() == "true":
    if not FRONTEND_DIST.is_dir():
        logger.warning(
            "SERVE_FRONTEND is enabled, but frontend/dist does not exist: %s",
            FRONTEND_DIST,
        )
    else:
        from fastapi.responses import FileResponse
        from fastapi.staticfiles import StaticFiles

        assets_dir = FRONTEND_DIST / "assets"

        if assets_dir.is_dir():
            app.mount(
                "/assets",
                StaticFiles(directory=assets_dir),
                name="frontend-assets",
            )

        @app.get("/{frontend_path:path}", include_in_schema=False)
        async def serve_frontend(frontend_path: str):
            """Serve frontend files and fall back to index.html for app routes."""

            if frontend_path == "api" or frontend_path.startswith("api/"):
                return JSONResponse(
                    status_code=404,
                    content={
                        "error": {
                            "code": "API_NOT_FOUND",
                            "message": "The requested API endpoint was not found.",
                            "hint": "Check the endpoint path and HTTP method.",
                            "ref": str(uuid.uuid4()),
                        }
                    },
                )

            requested_file = (FRONTEND_DIST / frontend_path).resolve()

            try:
                requested_file.relative_to(FRONTEND_DIST.resolve())
            except ValueError:
                return FileResponse(FRONTEND_DIST / "index.html")

            if requested_file.is_file():
                return FileResponse(requested_file)

            index_file = FRONTEND_DIST / "index.html"

            if index_file.is_file():
                return FileResponse(index_file)

            return JSONResponse(
                status_code=404,
                content={
                    "error": {
                        "code": "FRONTEND_NOT_FOUND",
                        "message": "The requested frontend page was not found.",
                        "hint": "Return to the application home page.",
                        "ref": str(uuid.uuid4()),
                    }
                },
            )
