# AI60 FINAL 02 – Phu Pha Digital Campus: Intelligent Timetabling
**Team plan (2 students)** · Vue + Vite + Tailwind · Node.js + Express · CP-SAT (OR-Tools) · **Firebase Realtime Database** · **Docker**

> Deadline Day 1: **16:30**. Dev window: **08:30–16:30** (8 hours). No edits after judges start testing.

---

## 0. Important technical note (read first)

**OR-Tools CP-SAT has no official Node.js package.** It supports Python, C++, Java, .NET.
Solution: Express stays the main backend, and calls a small **Python solver script** (`solver/solve.py`) through `child_process.spawn` (JSON in via stdin, JSON out via stdout).

```
Vue (browser) ──HTTP──> Express (Node) ──spawn──> Python + ortools (CP-SAT)
                         │
                         ├─ validate/clean CSV, export CSV
                         └─ firebase-admin ──> Firebase Realtime Database
                                               (sessions, cleaned data, jobs, schedules)
```

Keep it as **one Docker image** (Node 20 + Python 3 + `ortools`) so deployment is a single service. Firebase Realtime DB is an external managed service, so the container stays stateless and survives restarts on any cloud host.

---

## 1. Roles

| Person | Owns | Main folders |
|---|---|---|
| **A – Backend / AI** | CSV cleaning + validation, CP-SAT model, Express API, deploy | `server/`, `solver/`, `Dockerfile` |
| **B – Frontend / Docs** | Vue UI (upload, validation report, 3 timetable views, export), manual, slides | `client/`, `docs/` |

**Shared:** API contract (section 5), test data, checker script, final checklist.
Both people review each other's PR/merge before the 16:30 freeze.

### Working rules
- One GitHub repo, `main` is always deployable. Branches: `feat/backend`, `feat/solver`, `feat/ui`.
- Small commits, merge to `main` at least every hour.
- Agree on the **API contract first** (30 min) so B can build with mock JSON while A builds the real thing.
- Do not use the other team's code. Follow the judges' announcement about AI coding assistants and reused code.

---

## 2. Repo structure

```
phupha-timetable/
├─ client/                  # Vue 3 + Vite + Tailwind
│  ├─ src/
│  │  ├─ views/  UploadView, ValidationView, GenerateView, TimetableView, ExportView
│  │  ├─ components/  FileDropzone, IssueTable, TimetableGrid, StatCard
│  │  ├─ stores/  (Pinia) session.js
│  │  └─ api.js
│  └─ vite.config.js
├─ server/                  # Node + Express
│  ├─ index.js
│  ├─ routes/  upload.js, validate.js, generate.js, schedule.js, export.js
│  ├─ lib/  csvParse.js, clean.js, validate.js, checker.js, solverRunner.js
│  │  └─ db.js              # firebase-admin init + helpers (save/load/update)
│  └─ data/  (temp files only, never the source of truth)
├─ solver/
│  ├─ solve.py              # CP-SAT model
│  ├─ baseline.py           # greedy / local search for comparison
│  └─ requirements.txt      # ortools
├─ tools/
│  └─ check_solution.py     # independent checker (hard constraints)
├─ docs/  manual.md, cleaning_log.md, benchmark.md, slides/
├─ Dockerfile               # multi-stage: build Vue -> Node + Python runtime
├─ .dockerignore
├─ docker-compose.yml       # local dev/test (app + env file)
├─ .env.example             # variable names only, no secrets
├─ database.rules.json      # Firebase RTDB security rules
└─ PLAN.md
```

---

## 2.1 Database: Firebase Realtime Database

**Use:** persist everything per session so the judges can reload the page, switch device, or see results after a container restart.

### Setup (Person A, ~15 min, do it first)
1. Firebase console → create project → **Realtime Database** → create (region near Thailand, e.g. `asia-southeast1`).
2. Project settings → Service accounts → generate private key (JSON).
3. Put credentials in env vars on the server (see section 9). **Never commit the JSON key to GitHub.**
4. `npm i firebase-admin` in `server/`.

### Access model
- Only **Express** talks to the DB through the **Admin SDK** (it bypasses rules). The browser never touches Firebase directly.
- Security rules: deny all client reads/writes.

```json
{ "rules": { ".read": false, ".write": false } }
```
(Optional bonus: allow public `.read` on `/jobs/$jobId` only, so Vue can listen live to solver progress. Job IDs must be random/unguessable. Otherwise just poll `GET /api/jobs/:jobId` every 1–2 s – simpler and enough.)

### Data structure (JSON tree)
```
/sessions/{sessionId}
   createdAt, status ("uploaded"|"validated"|"generated")
   files/{fileName}            # raw rows summary: rowCount, columns
   raw/{fileName}/{rowIndex}   # raw rows (objects)
   cleaned/{fileName}/{rowIndex}
   cleaningLog/{logId}         # {file,row,column,before,after,rule}
   issues/{issueId}            # {severity,file,row,column,message,suggestion}
   stats                       # {offerings:63, periods:126, ...}

/jobs/{jobId}
   sessionId, method, status ("running"|"done"|"failed")
   startedAt, elapsedSec, objective, gap, solverStatus, config{seed,timeLimit,weights}

/schedules/{sessionId}/{offeringId}
   day, start_period, room_id, teacher_id, group_id, course_id, periods

/reports/{sessionId}
   hardChecks{c01..c12: {pass, violations}}, softMetrics{...}, benchmark{...}
```

### Realtime DB rules of thumb
- Keys cannot contain `. $ # [ ] /` → use IDs like `O001`, file names as `groups_csv`.
- Arrays become objects with numeric keys → store rows as objects keyed by index/ID and convert back to arrays in Express.
- Keep the tree **flat**; don't nest schedules inside sessions (so loading a session doesn't download everything).
- Large writes: save each CSV file in its own `set()` call, not one giant write.
- Re-running Generate overwrites `/schedules/{sessionId}` (use `set()`), and keeps old results under `/jobs` for the benchmark.
- Clean up old test sessions before the final demo.

### Fallback
If Firebase is unreachable, `db.js` falls back to an in-memory `Map` and shows a warning banner in the UI, so the demo can still run.

---

## 3. Timeline (Day 1)

| Time | A – Backend / AI | B – Frontend / Docs |
|---|---|---|
| 08:00–08:30 | Register, read data, skim all 10 CSVs | same |
| 08:30–09:15 | Agree API contract. Init repo, Express skeleton, **Dockerfile skeleton, Firebase project + `db.js`** | Init Vite+Vue+Tailwind, router, layout, mock API |
| 09:15–10:45 | CSV parse + **cleaning** + **validation** + cleaning log | Upload page + validation report page (IssueTable) |
| 10:45–12:30 | **CP-SAT model v1** (hard constraints 01–12) | Generate page (progress/status), timetable grid component |
| 12:30–13:15 | Lunch + **first deploy** (even if only upload works) | Lunch |
| 13:15–14:30 | Integrate solver with API, run on real data, run checker | 3 views (group / teacher / room) + export buttons |
| 14:30–15:30 | Soft objectives, time limit, baseline comparison, benchmark | Summary report page, manual draft, screenshots |
| 15:30–16:00 | Bug fixes, final deploy, test from another device | Finish manual, test accounts, README |
| 16:00–16:30 | **Freeze.** Final checklist (section 9), submit | Package deliverables |

**Milestone gates:** 10:45 clean data loads · 12:30 first valid timetable locally · 13:15 live URL · 15:00 solution.csv passes checker · 16:00 freeze.

---

## 4. Data pipeline

### 4.1 Cleaning rules (log every change into `cleaning_log`)
- IDs (teacher / room / group / course / offering): `trim` + `UPPERCASE`.
- Numbers like `" 02 "` → integer `2` when meaning is clear.
- Room type map: `GEN→GENERAL, COM→COMPUTER, NET→NETWORK, MED→MEDIA`.
- Remove duplicate rows **only if all fields are identical after normalization**.
- If duplicate rows have conflicting values → **do not delete**; report as an error.
- Never invent teachers/rooms/offerings; never reduce periods.

### 4.2 Validation checks (report file, row, column, message, suggestion)
- All 10 files present, required columns present, no empty required values.
- Foreign keys exist: offering → group/course/teacher; fixed/blocks → teacher/room/group; shared_students → groups.
- Room types are one of the 4 valid values; day in MON–FRI; period in 1–8.
- Total offerings = 63, total periods = 126 (show as a stat).
- Feasibility pre-checks: each offering has at least one room with correct type and capacity; fixed sessions don't conflict with each other or with blocks; teacher weekly load ≤ max.
- Output: `{ cleaned: {...}, issues: [{severity, file, row, column, message, suggestion}], log: [...] }`.

If there are blocking errors, **Generate is disabled** and the UI explains why.

---

## 5. API contract (agree first)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/upload` | multipart, 10 CSVs → `sessionId`, file summary (saved to Firebase `/sessions`) |
| POST | `/api/validate` | `{sessionId}` → issues + cleaning log + stats |
| GET | `/api/cleaned/:sessionId/:file` | download cleaned CSV |
| POST | `/api/generate` | `{sessionId, timeLimitSec, method: "cpsat"\|"baseline"}` → `jobId` |
| GET | `/api/jobs/:jobId` | status: `running/done/failed`, elapsed, objective, bestSoFar |
| GET | `/api/schedule/:sessionId` | list of `{offering_id, day, start_period, room_id, ...}` |
| GET | `/api/report/:sessionId` | hard-constraint check result + soft metrics |
| GET | `/api/export/solution.csv` | exact headers: `offering_id,day,start_period,room_id` (UTF-8 BOM) |
| GET | `/api/export/report` | summary report for end users |

Auth: simple test account (e.g. `judge / judge1234`) via a basic login or an env-var token. Don't over-build.

---

## 6. CP-SAT model design (`solver/solve.py`)

### 6.1 Time structure
- Days: MON–FRI. Periods 1–8. Morning block = periods **1–4**, afternoon block = **5–8**. Lunch is not a period.
- A session with `p` periods starting at `s` is valid only if all periods lie in **one block**:
  - morning: `s + p - 1 ≤ 4`, afternoon: `s ≥ 5` and `s + p - 1 ≤ 8`.
  - (e.g. a 3-period session starting at 3 or 4 is illegal – it crosses lunch.)

### 6.2 Pre-computed candidate placements (reduces model size a lot)
For each offering `o`, build the list of `(day, start, room)` such that:
1. Room type matches the course type and capacity ≥ group size.
2. Block rule above holds, and every occupied period is in `timeslots.csv`.
3. No occupied period is in `teacher_blocks` (for the teacher) or `room_blocks` (for the room).
4. If `o` is in `fixed_sessions.csv` → keep **only** that exact placement.

Boolean variable `x[o, k]` for each candidate `k`.

### 6.3 Hard constraints
| # | Constraint | Encoding |
|---|---|---|
| 12 | Each offering exactly once | `sum_k x[o,k] == 1` |
| 01 | Teacher no overlap | for each (teacher, day, period): `sum x covering it ≤ 1` |
| 02 | Room no overlap | for each (room, day, period): `≤ 1` |
| 03 | Group no overlap | for each (group, day, period): `≤ 1` |
| 04 | Shared-student pairs | for each pair (g1,g2), (day, period): `occupancy(g1)+occupancy(g2) ≤ 1` |
| 05–08 | Room type, capacity, blocks, days/periods | handled in candidate filtering |
| 06 | Contiguous, same day/room, no lunch crossing | inherent in placement |
| 09 | Group max per day | `sum periods in day ≤ max_periods_per_day` |
| 10 | Teacher max per day / per week | same style, day and week sums |
| 11 | Fixed sessions | single candidate (verify they are consistent) |

Tip: build `occ[entity, day, period]` as lists of literals while enumerating candidates, then add `AddAtMostOne(list)`. It's fast and simple.

### 6.4 Soft objectives (only after feasibility works)
Weighted minimization (weights in a config object, documented for the presentation):
1. **Teacher idle gaps** within a day (periods between first and last class). Use per-teacher/day occupancy booleans + "first/last" variables, or a simplified penalty.
2. **Group load balance**: minimize max periods/day per group, or sum of deviation from average.
3. **Compactness / consistency** (optional): fewer days used per teacher.
4. **Compute time**: set `max_time_in_seconds` (e.g. 30–60 s) and `num_workers = 8`; also fix `random_seed` for **reproducibility**.

Strategy: first solve for feasibility (fast), then add objective and use the first solution as a hint (`AddHint`) for improvement.

### 6.5 Output and failure handling
- Return `status` (OPTIMAL / FEASIBLE / INFEASIBLE / UNKNOWN), objective, gap, wall time, and assignments.
- If INFEASIBLE: run a diagnostic (relax constraint groups with assumptions / `AddAssumptions`, or test per-group) and tell the user **which constraint family** is the likely cause. This earns points for "gives correct error when cannot schedule".

---

## 7. AI technique points (Day 2 content, prepare during Day 1)

| Rubric item | What we show |
|---|---|
| Method choice (4) | Why CP-SAT: discrete, many hard constraints, proves infeasibility, optimizes soft goals |
| Agentic (6) | Pipeline of roles: *Cleaner → Validator → Planner (CP-SAT) → Checker → Explainer*. Checker re-verifies output independently; Explainer writes plain-language report / infeasibility reasons |
| Comparison (6) | `baseline.py` (greedy + simple local search) vs CP-SAT: hard violations, idle gaps, balance, time. Table in `docs/benchmark.md` |
| Creative (2) | Placement pre-filtering, hint warm-start, infeasibility diagnosis |
| Reproducible (2) | Fixed seed, config saved with the result, same input → same output |

Benchmark table template:

| Method | Valid? | Hard violations | Teacher gaps | Group balance (max/day) | Time (s) |
|---|---|---|---|---|---|
| Greedy baseline | | | | | |
| Greedy + local search | | | | | |
| **CP-SAT** | | | | | |

---

## 8. Frontend plan (Vue 3 + Vite + Tailwind)

Pages (stepper UI: **Upload → Validate → Generate → View → Export**):
1. **Upload** – drag-drop 10 files, show which are missing, file row counts.
2. **Validate** – issue table (severity, file, row, column, message, suggestion), cleaning log, "download cleaned CSV". Button to continue only when no blocking errors.
3. **Generate** – time limit input, start button, live status/elapsed time, spinner/progress (UX while computing = 5 pts).
4. **Timetable** – tabs: **By group / By teacher / By room**. Select dropdown + weekly grid (Mon–Fri × periods 1–8, lunch row between 4 and 5). Colour by course, tooltip with room/teacher.
5. **Export** – download `solution.csv`, user report, cleaned data, hard-constraint check result (✔ 12 rules).

Libraries: Vue Router, Pinia, Axios/fetch. Keep UI simple and clean; Tailwind utility classes only.

Dev setup:
```bash
npm create vite@latest client -- --template vue
cd client && npm i && npm i -D tailwindcss @tailwindcss/vite
npm i vue-router pinia
```
Vite proxy `/api` → `http://localhost:3000` during development. In production Express serves `client/dist`.

---

## 9. Docker & Deployment

### 9.1 `Dockerfile` (multi-stage, place at repo root)

```dockerfile
# ---------- Stage 1: build Vue frontend ----------
FROM node:20-slim AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---------- Stage 2: runtime (Node + Python + OR-Tools) ----------
FROM node:20-slim
ENV NODE_ENV=production

# Python for CP-SAT
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv python3-pip \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps in a virtualenv
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY solver/requirements.txt solver/requirements.txt
RUN pip install --no-cache-dir -r solver/requirements.txt

# Node deps (backend)
COPY server/package*.json server/
RUN cd server && npm ci --omit=dev

# App code
COPY server/ server/
COPY solver/ solver/
COPY --from=client-build /app/client/dist client/dist

ENV PORT=3000
ENV PYTHON_BIN=/opt/venv/bin/python
EXPOSE 3000

CMD ["node", "server/index.js"]
```

`solver/requirements.txt`:
```
ortools
```

### 9.2 `.dockerignore`
```
node_modules
**/node_modules
client/dist
.git
.env
*.json.key
serviceAccount*.json
server/data
```

### 9.3 `docker-compose.yml` (local test, same image as production)
```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    env_file:
      - .env
```
Run locally: `docker compose up --build` → open `http://localhost:3000`.

### 9.4 Environment variables (`.env.example`)
```
PORT=3000
ADMIN_USER=judge
ADMIN_PASS=change-me
SOLVER_TIMEOUT=60
PYTHON_BIN=/opt/venv/bin/python

# Firebase Realtime Database
FIREBASE_DATABASE_URL=https://<your-project>-default-rtdb.asia-southeast1.firebasedatabase.app
# Service-account JSON, base64-encoded (one line):  base64 -w0 serviceAccount.json
FIREBASE_SERVICE_ACCOUNT_B64=
```
In `server/lib/db.js`: decode `FIREBASE_SERVICE_ACCOUNT_B64` → `admin.credential.cert(...)` → `admin.initializeApp({ credential, databaseURL })`.
Set the same variables in the hosting dashboard. **Never commit `.env` or the key file.**

### 9.5 Deploy steps
1. Push repo to GitHub (Docker files included).
2. Create a service on Render / Railway / Fly.io → "Deploy from Dockerfile" → set env vars from 9.4.
3. Confirm the health route `GET /api/health` returns OK (also checks Firebase read + `python --version` + `import ortools`).
4. **Deploy the skeleton by 13:00**, then redeploy on every merge to `main`.
5. Test on another device: upload → validate → generate → export.

### 9.6 Deployment pitfalls
- Free tiers may sleep or have low CPU → test real solve time on the cloud; set a realistic default time limit; open the URL a few minutes before judging to warm it up.
- Container disk is temporary → keep all important data in Firebase, not in local files.
- Build must work offline from the repo (lock files `package-lock.json` committed, `ortools` pinned if possible).
- Check Firebase DB region/URL matches the env var, otherwise connection fails silently.

---

## 10. Testing

- `tools/check_solution.py`: reads cleaned CSVs + `solution.csv`, verifies all 12 hard constraints independently of the solver. Run before every submit.
- Cases to test: original raw data, cleaned data, missing file, duplicate with conflict, bad room type, impossible data (e.g. teacher max too low) → must show clear error.
- Stability: run 5× with the same seed → same objective; run with different seeds → record variance.
- Check exported `solution.csv`: header exactly `offering_id,day,start_period,room_id`, 63 rows, one per offering, opens in Excel (UTF-8 BOM).

---

## 11. Deliverables checklist (submit by 16:30)

- [ ] Live URL + test account
- [ ] `Dockerfile`, `docker-compose.yml`, `.env.example` in the repo (no secrets)
- [ ] Firebase RTDB rules set to deny client access; test data cleaned up
- [ ] Source code / GitHub repo link
- [ ] `solution.csv` + timetable output
- [ ] Short manual (1–3 pages): Upload → Validate → Generate → Export
- [ ] Cleaned CSV files + `cleaning_log`
- [ ] Slides or video (optional, finish Day 2 morning)

### Final quality checklist
- [ ] All 10 files pass validation, none missing required data
- [ ] All 63 offerings scheduled, total 126 periods
- [ ] `solution.csv` columns correct and opens in Excel
- [ ] No clash: teacher / room / group / shared students
- [ ] Blocks, fixed sessions, max periods respected
- [ ] 3 views (group / teacher / room) consistent with each other
- [ ] URL opens from a different device
- [ ] Submitted before 16:30

---

## 12. Presentation outline (Day 2, 10 min)

| Time | Topic |
|---|---|
| 0:00–1:00 | Problem & goal |
| 1:00–2:30 | Input data, key constraints, cleaning issues found |
| 2:30–4:30 | Why CP-SAT, model sketch, agentic pipeline |
| 4:30–7:30 | Live demo: Upload → Validate → Generate → View → Export |
| 7:30–9:00 | Test results, benchmark vs baseline, timing |
| 9:00–10:00 | Strengths, limitations, Q&A |

Prepare answers for: *Why CP-SAT? How did you encode lunch break? What if infeasible? What are the objective weights? How do you know the result is valid?*

---

## 13. Risks & fallbacks

| Risk | Mitigation |
|---|---|
| No Node binding for CP-SAT | Python subprocess (section 0); test spawn on cloud early |
| Cloud lacks Python/ortools | Dockerfile (section 9); deploy skeleton at lunch |
| Firebase credentials leaked or misconfigured | Env vars only, `.dockerignore`, deny-all rules, `/api/health` check, in-memory fallback |
| Firebase write too large / slow | One `set()` per CSV file, flat tree, store only needed fields |
| Model too slow | Candidate pre-filtering, time limit, hints, `num_workers` |
| Infeasible due to bad data | Validation pre-checks + relaxation diagnosis |
| Merge conflicts | Strict folder ownership (A: server/solver, B: client/docs) |
| Last-minute bug | Freeze at 16:00; keep a tagged known-good commit |
