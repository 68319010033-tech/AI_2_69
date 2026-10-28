# Phu Pha Digital Campus – Backend

Express + Python CP-SAT (OR-Tools) + Firebase Realtime DB (in-memory fallback).

## Run locally
```bash
pip install -r solver/requirements.txt
cd server && npm install && cd ..
node server/index.js        # Configure .env first; see ../AUTH_SETUP.md
python3 tools/make_sample_data.py sample_data   # synthetic test CSVs (NOT the real data)
```
Or: `cp .env.example .env && docker compose up --build`.

## Flow / API

See [authentication setup](../AUTH_SETUP.md) for required environment variables,
Google/SMTP configuration and test users. Login is now `POST /api/auth/login`
with `{email,password}` and an allowed Origin. Sessions use HttpOnly cookies.
Legacy `/api/login`, bearer/query tokens and `AUTH_DISABLED` have been removed.
| Step | Endpoint |
|---|---|
| Upload | `POST /api/upload` multipart, files named `groups.csv`, ... (returns `sessionId`) |
| Validate | `POST /api/validate {sessionId}` -> issues, cleaning log, stats, `canGenerate` |
| Generate | `POST /api/generate {sessionId, method:"cpsat"\|"baseline", timeLimitSec, seed, workers, weights}` -> `jobId` |
| Poll | `GET /api/jobs/:jobId` (status, elapsedSec, objective, bound, valid, metrics, error/culprits) |
| View | `GET /api/schedule/:sid?method=` (items + groups/teachers/rooms for the 3 views) |
| Compare | `GET /api/compare/:sid` (baseline vs CP-SAT) · `GET /api/report/:sid` |
| Export | `GET /api/export/:sid/solution.csv` · `/report.md` · `GET /api/cleaned/:sid/:file.csv` · `GET /api/cleaning-log/:sid` |
| Health | `GET /api/health` (DB + Python + ortools) |

## Independent check
```bash
python3 tools/check_solution.py --data cleaned_dir --solution solution.csv
```

## ASSUMED COLUMN NAMES (verify with real data!)
`server/lib/schema.js` lists canonical columns + aliases per file. If a real header is not recognized,
validation reports "Required column ... not found" with the headers it saw: add that header to `aliases`.
