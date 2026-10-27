# Production path: PostgreSQL and object storage

The portal ships on SQLite (`better-sqlite3`) so it runs with no infrastructure. That is right for a pilot or a single-office
deployment. For national roll-out the PRD calls for PostgreSQL and object storage. This is the intended path; nothing here
requires redesigning the application.

## 1. What is already in place
- `DATA_DIR` environment variable moves the database file and uploads to a mounted volume.
- All SQL is confined to `server/src/db`, `server/src/routes/*` and `server/src/engagement/*`; the schema is a single
  `server/src/db/schema.sql` using portable types (`TEXT`, `INTEGER`, `REAL`) and `CHECK` constraints.
- Province and institution scoping is enforced in the API layer (`middleware/scope.ts` and the monitoring routes), not in the
  database, so it carries over unchanged.
- Uploaded evidence is referenced by path only (`response_evidence_path`, whistleblower attachments).

## 2. Database migration steps
1. Provision PostgreSQL 15+ with TLS, daily backups and point-in-time recovery.
2. Translate `schema.sql`: `TEXT` primary keys become `uuid`; `datetime('now')` defaults become `now()`; JSON stored in `TEXT`
   columns (`allegations`, `objectives`, `explanation`, ...) become `jsonb`; `INTEGER` 0/1 flags become `boolean`.
3. Replace `better-sqlite3` calls with `pg` (or Kysely). The data layer uses synchronous prepared statements, so this is
   a mechanical change to `await`; keep one transaction wrapper (`db.transaction`) as the single seam.
4. Replace SQLite-specific functions: `date('now')`, `substr(...)`, `datetime('now')` and `INSERT OR IGNORE`
   (use `now()`, `left(...)`, `ON CONFLICT DO NOTHING`).
5. Export from SQLite with `sqlite3 zacc_portal.db .dump`, load into a staging Postgres, run `npm run test:e2e` against staging,
   compare row counts per table, then cut over in a maintenance window.
6. Row-level security is optional defence in depth: set `app.province` / `app.institution_id` per request and add policies
   matching `scope.ts`.

## 3. Object storage
1. Introduce a `Storage` interface (`put`, `get`, `delete`, `signedUrl`) with a local-disk implementation (today's behaviour)
   and an S3-compatible implementation (MinIO on-premises, or a government cloud bucket).
2. Store the object key, SHA-256 and content type in the database instead of a filesystem path.
3. Enable server-side encryption and bucket versioning; serve downloads through short-lived signed URLs after the same
   authorisation check used today.
4. Migrate existing files with a one-off script that uploads each path and rewrites the column.

## 4. Operations checklist
- Secrets from a vault, not `.env`; rotate JWT secrets on a schedule.
- Run behind a TLS-terminating reverse proxy; set `CORS_ORIGIN` to the portal origin only.
- Scheduler (`node-cron`) must run on exactly one instance; if scaling out, move it to a single worker or use `pg_advisory_lock`.
- Socket.IO needs sticky sessions or the Redis adapter when running more than one instance.
- Back up `DATA_DIR` (or the database and bucket) and test a restore quarterly.
