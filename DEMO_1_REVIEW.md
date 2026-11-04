# Demo_1 product improvements

This branch is a review build. No deployment action is included in its CI workflow.

## Included
- Dashboard with a term label, next-step checklist, validation status and last successful generation time.
- Guided sample setup and downloadable examples for all ten CSV inputs.
- Validation summary, file/severity/search filters, missing-file reminders, per-file error badges and error-only row filtering.
- Undo for the last 20 data mutations, deletion confirmation, local draft status, input backup download and validated backup restore.
- Server-side job cancellation with session ownership checks, honest elapsed-time progress labeling and cancelled/failed states.
- Timetable search, overlap review for teachers/rooms/groups, loading recovery and empty states.
- Shared card/button styles, keyboard focus, reduced-motion support and translated new interface labels.
- In-app unexpected-error notification, an on-demand service health check and a test/build-only GitHub Actions workflow.

## Validation
Frontend unit tests cover parsing, draft persistence, undo, backup restore and schedule overlaps. Backend integration tests cover sample upload → validation → job start → cancellation, including rejection for a different owner. Solver execution is mocked in that cancellation integration test.

Browser QA used an isolated in-memory local server: sign-in, sample load, validation, required-value error, undo and revalidation. The production Render service was not modified.

## Limits
- Undo is local to the current signed-in browser session; data changes still require revalidation.
- Backup files contain input data and the term label, not generated schedules. Store downloaded files securely.
- Health checks and unexpected-error notices are local UI diagnostics, not a hosted monitoring/alerting service. Automated database backups need separate infrastructure configuration.
- The overlap review supplements, rather than replaces, the backend's full constraint report.
- Full live Python solver execution and production database backup/restore were not tested in this environment.
- The export bundle retains the existing build size warning.

## Local review
Install dependencies with `npm ci --prefix frontend` and `npm ci --prefix Backend/server`. Start the backend using the repository's existing authentication/environment setup, then run `npm run dev --prefix frontend`. No preview credentials are committed.
