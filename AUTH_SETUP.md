# Login, Google sign-in, email OTP and admin test users

This branch combines the existing Vue frontend with the `Backend` branch's Express,
Firebase Realtime Database and Python solvers. It replaces the legacy `judge` login,
in-memory bearer tokens, query-string tokens and `AUTH_DISABLED` bypass.

## Local setup

Use Node 24.12+ and Python 3.10+. From the repository root:

```sh
cd Backend/server
npm ci
cd ../../frontend
npm ci
cd ..
python -m pip install -r Backend/solver/requirements.txt
```

Copy `Backend/.env.example` to `Backend/.env`. Generate `JWT_SECRET` using the command
in the example. Set `PYTHON_BIN` to your Python executable if `python` is unavailable.
Start the API with `cd Backend/server` then `npm run dev`. In another terminal run
`cd frontend` then `npm run dev`, and open http://localhost:5173.
Vite proxies `/api` to port 3000. Keep this same-origin API arrangement in deployment.
Do not put secrets in frontend environment variables.

## Admin and regular test accounts

Set `SEED_TEST_USERS=1` in `Backend/.env` for local development and start the server:

| Role | Default email | Password |
| --- | --- | --- |
| Admin | `admin@example.test` | `TEST_ADMIN_PASSWORD`, or generated at startup |
| User | `user@example.test` | `TEST_USER_PASSWORD`, or generated at startup |

Passwords must contain 12–128 characters. Newly created test credentials are printed
only by the explicit seed operation; no default shared password is committed.
These accounts are preverified for password-login testing. `.test` mailboxes cannot
receive OTPs: use real email addresses to test delivery. Existing accounts are never
overwritten or promoted. With Firebase configured, `npm run seed` is also available
from `Backend/server`; disable startup seeding after creating accounts. The seed is
refused when `NODE_ENV=production`. An admin sees `/admin`, a read-only account list;
regular users are rejected by both the router and backend admin endpoint.

Without Firebase, development data and test accounts disappear on restart. A
standalone seed command cannot populate another process's memory, so use startup
seeding in that mode. Firebase credentials are mandatory in production and invalid
Firebase credentials fail startup rather than silently falling back to memory.

## Google sign-in

Create a Google Cloud OAuth client with application type **Web application**.
Configure the consent screen and add `http://localhost:5173` (and your deployed HTTPS
origin) under Authorized JavaScript origins. Set its client ID as `GOOGLE_CLIENT_ID`.
The official Google Identity Services button returns an ID token. The backend
verifies signature, audience, issuer and expiry using Google's library, then checks
verified email and issues the application's own JWT session. Gmail and verified
Workspace accounts are supported. An existing unverified local account must first
complete email verification. Users cannot choose an admin role during signup.

Reference: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token

## OTP delivery to Gmail

Configure `SMTP_USER` and `SMTP_PASS` with the sending mailbox and its Google App
Password (requires eligible account settings and 2-Step Verification), or use another
SMTP provider. Defaults are Gmail port 465 with TLS; port 587 uses STARTTLS.
`SMTP_FROM` should match the sender or an authorized alias. Do not use a normal Google
password. Codes can be sent to Gmail or other valid email addresses; this is your
application's email verification, not a Google account OTP.

Reference: https://nodemailer.com/guides/using-gmail

Registration requires email verification. Email-code sign-in is available for verified
accounts. Password reset uses a separate OTP purpose and revokes all sessions.
Codes expire after 10 minutes, permit five attempts, are single-use, and are stored
as keyed hashes. Resending waits at least 60 seconds, with five emails per account
per hour. The UI uses generic eligibility messages to avoid exposing account status.
Missing SMTP or failed delivery never returns a successful verification or fake code.

## Sessions and data access

Access JWTs expire after 15 minutes; refresh sessions expire after seven days and
rotate on use. Both cookies are HttpOnly, SameSite=Lax and Secure in production.
Every authenticated request checks the persisted session, so logout and password
reset revoke access immediately. Tokens are not stored in localStorage or URLs.
Unsafe requests must carry an Origin exactly matching `APP_ORIGIN`.

Uploads are owned by the signed-in user. All timetable, job, validation and download
routes enforce ownership; admins can access all timetable sessions. Existing legacy
sessions with no owner are accessible only to admins. Frontend downloads use the
authenticated HTTP client so expired access tokens can refresh before download.

Login attempts are limited per email in Firebase, with an additional process-local
IP limiter on authentication routes. For multi-instance deployment, also configure
a shared edge/IP rate limit. Periodically purge expired `authLoginAttempts` records
to bound storage. Do not enable broad proxy trust: set `TRUST_PROXY_HOPS` to your
actual trusted proxy count. Keep `Backend/database.rules.json` denying client reads
and writes; only the server's service account should access authentication records.

## Build, deploy and test

```sh
cd Backend/server
npm test
cd ../../frontend
npm run build
```

The Express server serves `frontend/dist` after building. For that local production
preview, set `APP_ORIGIN=http://localhost:3000` while retaining development mode.
In real deployment set `NODE_ENV=production`, an HTTPS `APP_ORIGIN`, Firebase, SMTP
and Google settings. Deploy behind HTTPS on the same origin for UI and `/api`.
Docker from repository root: `docker build -f Backend/Dockerfile -t phupha .`.
Or use `docker compose -f Backend/docker-compose.yml up --build`.

Automated tests use the in-memory database and stub email delivery/Google verification.
They cover OTP limits and replay, JWT expiry, refresh rotation, logout, reset,
admin checks, session ownership, CSRF and test seeds. Real Firebase, Google consent,
SMTP delivery and deployment TLS require an end-to-end check with your credentials.
The existing Python scheduling algorithms are retained; authentication tests do not
validate solver correctness.
