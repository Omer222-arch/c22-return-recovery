# ReCoverIQ Frontend

A React + TypeScript + Vite frontend for the ReCoverIQ returned-stock recovery planning project.

## Requirements
- Node.js 20+ recommended
- npm

## Run locally (Windows CMD)
1. Extract the ZIP.
2. Open CMD in the extracted `ReCoverIQ-Frontend` folder.
3. Run:

```cmd
npm install
npm run dev
```

4. Open the local URL shown by Vite, usually `http://localhost:5173`.

## Production build

```cmd
npm run build
npm run preview
```

## Backend configuration
Create a `.env` file in the project root (or copy `.env.example` to `.env`) and set:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

The UI uses demo data when the backend is unavailable. It does not silently claim that demo values came from the API.

## Implemented pages
- Overview
- Recovery Workbench
- Scenario Lab (placeholder for Member 1 integration)
- Data Center and Proposal Review (Member 2 integration placeholders)
- Case Checks, Business and Pilot Tracker (Member 4 integration placeholders)

## Notes
- All example values are illustrative synthetic scenario data.
- Recovery routes are estimates and should be validated against eligibility and safety constraints before any real-world decision.
