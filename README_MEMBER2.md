# C22 — Member 2 Backend Package

This package contains the Member 2 data-validation, proposal workflow, outcome recording, and FastAPI API layer for the Returned Stock Recovery Planner.

## Contents

- `backend/api.py` — FastAPI application and API endpoints.
- `backend/services/fixture_service.py` — fixture loading.
- `backend/services/validation_service.py` — lot-batch and route-assumption validation.
- `backend/services/proposal_service.py` — recovery comparison, reviewed proposal creation, and actual outcome recording.
- `backend/repositories/proposal_repository.py` — SQLite repository for local development/testing.
- `api/index.py` — Vercel entry point.
- `engine.py` — Member 1 recovery engine dependency.
- `data/fixture.json` — synthetic C22 fixture.
- `tests/test_member2_workflow.py` — Member 2 tests.
- `vercel.json` — Vercel routing configuration.
- `.env.example` — CORS configuration example.

## Run locally

```bash
python -m pip install -r requirements.txt
uvicorn backend.api:app --reload
```

Then open `http://127.0.0.1:8000/docs`.

Run tests:

```bash
python -m pytest -q
```

## Production persistence warning

The included SQLite repository is suitable for local development/demo testing. Do **not** rely on a SQLite file on a serverless Vercel deployment as durable production storage. For persistent proposals/outcomes, replace the repository with a managed database (for example PostgreSQL) before production use.

## React connection

Set the React frontend environment variable to the deployed backend URL:

```env
VITE_API_BASE_URL=https://YOUR-BACKEND.vercel.app
```

Configure the backend's `C22_CORS_ORIGINS` environment variable to the Netlify frontend origin.
