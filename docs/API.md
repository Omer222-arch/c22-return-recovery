# RecoverIQ API Reference

## 1. Overview

RecoverIQ is a decision-support API for evaluating returned-stock
recovery routes, saving reviewed proposals, recording realized outcomes,
and comparing forecast recovery with recorded results.

The API provides estimates and workflow records. Forecasts are not
guaranteed recovery, and recorded outcomes are not independently verified.

### Local development

Default base URL:

http://127.0.0.1:8080

Interactive API documentation:

http://127.0.0.1:8080/docs

If port 8080 is already occupied, another available port can be used.

## 2. Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/` | API information |
| GET | `/api/health` | Health check |
| GET | `/api/lots` | Retrieve synthetic lots |
| GET | `/api/assumptions` | Retrieve assumption data |
| POST | `/api/lots/validate` | Validate a batch of lots |
| POST | `/api/recovery/compare` | Compare recovery routes |
| POST | `/api/proposals` | Create a reviewed proposal |
| GET | `/api/proposals` | List proposals |
| GET | `/api/proposals/{proposal_id}` | Retrieve a proposal |
| PATCH | `/api/proposals/{proposal_id}/status` | Update proposal status |
| POST | `/api/proposals/{proposal_id}/outcomes` | Record a realized outcome |
| GET | `/api/proposals/{proposal_id}/outcomes` | List outcomes for a proposal |
| GET | `/api/variance` | Compare forecasts with recorded outcomes |

## 3. Health check

### `GET /api/health`

Example response:

```json
{
  "status": "ok"
}