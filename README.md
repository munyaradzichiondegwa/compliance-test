# ZACC Institutional Compliance Portal

A complete, working implementation of the ZACC Institutional Compliance Portal PRD (v4.0) —
every module built and wired together, not a mockup. This document explains how to run it,
what's in it, and how to take it from this demo build to a real production deployment.

> **Built by NevTech Consultancy.** This is a full-stack application: a Node.js/TypeScript API
> and a React 18/TypeScript frontend, sharing one SQLite database, running as a single
> deployable service.

---

## 1. Quick Start

Requirements: **Node.js 20+** and **npm**. No separate database server to install — everything
runs on SQLite until you choose to migrate (see §7).

```bash
# from the repository root
npm install            # installs the root's one small dev-dependency (concurrently)
npm run setup           # installs server + client deps, seeds demo data, builds both
npm run start           # serves the whole portal — API + frontend + websockets — on one port
```

Then open **http://localhost:4000**.

For active development with hot-reload on both sides instead of a production build:

```bash
npm run install:all
npm run seed
npm run dev              # server on :4000 (API/sockets), client on :5173 (proxies to :4000)
```

Open **http://localhost:5173** in development mode.

### Re-seeding

The seed script is fully idempotent — it drops and rebuilds every table, then repopulates a
rich, realistic demo dataset (24 institutions, ~40 assessments, ~190 recommendations, 5 systems
reviews, 10 integrity committees, 10 pledge instruments, 12 risk register entries, procurement
records with genuine computed red flags, and 7 whistleblower reports that are **genuinely**
RSA/AES encrypted — see §5). Run it again any time with `npm run seed`.

---

## 2. Demo Credentials

Shared password for every seeded account: **`ZaccDemo#2026`**

| Role | Email |
|---|---|
| Super Administrator | `admin@zacc.gov.zw` |
| Prevention & Corporate Governance Head | `prevention.head@zacc.gov.zw` |
| Compliance Officer (×3) | `officer1@zacc.gov.zw`, `officer2@…`, `officer3@…` |
| Systems Reviewer (×2) | `reviewer1@zacc.gov.zw`, `reviewer2@…` |
| Monitoring Officer (×2) | `monitoring1@zacc.gov.zw`, `monitoring2@…` |
| Auditor (×2) | `auditor@zacc.gov.zw`, `oag.auditor@oag.gov.zw` |
| Investigations Officer | `investigations@zacc.gov.zw` |
| Institution Focal Person | `focal.1@institution-demo.zw` … `focal.10@…` |
| Integrity Committee Chair | `committee.chair.1@institution-demo.zw` … `chair.10@…` |

The login screen has a **"Use a demo account"** picker that fills these in for you.

**Every account enrols in TOTP MFA on first login** (a real, working implementation — scan the
QR code with Google Authenticator, Authy, 1Password, etc.). This is not skippable, matching the
PRD's mandatory-MFA requirement for all staff accounts.

---

## 3. What's actually implemented

Every module in PRD §10 is here as real, working code — genuine database-backed CRUD, genuine
business logic, genuine algorithms — not placeholders. Highlights:

| Module | What's real |
|---|---|
| **Institutional Registry** | Full CRUD, risk classification, change-history audit trail |
| **Compliance Assessment** | Live weighted scoring (Gov 20 / Controls 25 / Procurement 20 / Finance 20 / Integrity 15) recalculated on every checklist edit; RAG bands; full Draft→Submitted→UnderReview→Approved/Returned→Closed lifecycle; auto-generated implementation matrix on approval |
| **Systems Review** | Multi-reviewer collaboration, real document version control, findings library |
| **Recommendation Tracking** | Full state machine with 30/60/90-day aging, verification workflow |
| **Integrity Committee** | Charters, members, training records, meeting minutes, action plans |
| **Integrity Pledge** | Digital e-signature (typed name + timestamp), expiry reminders, CSV bulk import |
| **Whistleblower Reporting** | **Real hybrid RSA-OAEP/AES-256-GCM encryption performed in the browser** before anything is transmitted (see §5) — anonymous, tracked, access-logged |
| **Procurement Monitoring** | A genuine rule engine (single-sourcing, split-purchase detection, duplicate contracts, supplier concentration) evaluated against real history on every insert |
| **Notification Service** | Real template rendering, in-app + live websocket push, per-user channel preferences, dev-mailbox pattern for email/SMS (see §6) |
| **Workflow Engine** | Admin-editable SLA thresholds & escalation targets (no code change needed), hourly automatic sweep + on-demand trigger |
| **Risk Scoring Engine** | Likelihood × Impact (1–25), 5×5 heat map, residual-risk calculation from mitigation effectiveness |
| **Corruption Risk Register** | Full CRUD, linked to assessments/reviews, trend analysis |
| **AI/ML Module** | Genuinely working, self-contained heuristics — see §4 |
| **GIS Module** | Province heat map, institution geotagging (real browser Geolocation API), k-means proximity clustering with nearest-neighbour route suggestion |
| **Audit Dashboard** | All six AUD widgets computed from live data |
| **Reporting Catalogue** | Real PDF generation (assessment reports, institutional scorecards) and CSV export |

---

## 4. About the "AI" module — read this before assuming a hidden LLM call

Per the PRD's own note in §10.6 ("no institutional or whistleblower data is transmitted to
third-party AI services without explicit DPO approval") **and** because this environment has no
provisioned LLM API credentials for a standalone server to call, every AI feature is a genuine,
self-contained, deterministic implementation with **zero external network calls**:

- **Auto-summarisation** — extractive, word-frequency sentence scoring
- **Duplicate finding detection** — token-similarity (Jaccard + light stemming) across the whole
  findings corpus, surfaced with a similarity score for a human reviewer to confirm
- **Auto-drafting** — structured narrative generation directly from checklist data (real facts,
  not fabricated)
- **Predictive risk modelling** — ordinary least-squares trend projection over an institution's
  assessment history
- **Natural-language search** — keyword/TF relevance ranking across findings, assessments,
  recommendations and risks

These are honestly "Phase 4-appropriate" statistical AI, not generative AI — which is exactly
what the PRD scopes for this stage. `server/src/utils/ai.ts` has a documented extension point
showing exactly where a real LLM call would be wired in later once DPO approval and API
credentials exist.

---

## 5. Whistleblower encryption — how it actually works

This is real cryptography, not a UI mockup:

1. The browser fetches the Investigations team's RSA-2048 public key from
   `GET /api/v1/whistleblower/public-key`.
2. The browser generates a random AES-256 key and encrypts the report text with AES-GCM
   (Web Crypto API — nothing server-side is involved yet).
3. The browser wraps the AES key with the RSA public key (RSA-OAEP/SHA-256).
4. Only ciphertext + wrapped key + IV are ever transmitted. The server cannot read a report's
   content — until an authenticated `INVESTIGATIONS_OFFICER` explicitly opens it, which decrypts
   server-side with the RSA private key **and is itself logged** to that report's own access
   trail (`whistleblower_access_log`), satisfying the PRD's "restricted, visible only to named
   investigation teams" requirement.
5. No IP address, account, or identifying header is ever recorded for a submission. A random,
   identity-unlinkable tracking code (`WB-XXXXXXXX`) is the only way to check status later.

**Honesty note on key custody:** this gives strong encryption-in-transit-and-at-rest with
tightly scoped decryption authority — the same model most enterprise whistleblower platforms
use. It is not zero-knowledge against a *fully compromised server*, since the RSA private key
lives on that server's disk (`server/data/keys/wb_private.pem`, generated on first run,
file-permission 600). Before handling real reporters in production, harden this further:
split the private key across multiple Commissioners with threshold cryptography, or move it
into an HSM/Vault. This is flagged deliberately rather than overclaiming a guarantee the current
build doesn't provide.

---

## 6. Engineering decisions & honest scope notes

Built to demonstrate every module fully functional in a single, dependency-light environment.
Where that required a substitution from the PRD's suggested stack, here's exactly what and why —
and how to move to the "real" version:

| PRD suggests | This build uses | Why | Path to production |
|---|---|---|---|
| .NET 8 backend | Node.js 22 + TypeScript + Express | Runs anywhere without a separate SDK; identical REST/RBAC/workflow architecture | Port the route logic 1:1 to ASP.NET Core if institutional/government-sector familiarity with .NET is a hard requirement |
| PostgreSQL | SQLite (via better-sqlite3) | Zero-install, single-file, trivially portable for a demo | All SQL is plain parameterised queries in a thin repository style — swap the driver and adjust `schema.sql`'s dialect-specific bits (mostly none needed) |
| Keycloak | Built-in JWT + bcrypt + TOTP MFA | No separate identity server to stand up | Swap `utils/jwt.ts` calls for an OIDC client if centralising identity across other ZACC systems |
| RabbitMQ / Camunda | In-process notification dispatch + workflow config table | No message broker to provision | Fine at this scale (single ZACC deployment); revisit if scaling to a multi-service architecture |
| Real ZACC ECMS / PRAZ eGP / OAG / JSC-NPA / Registrar integrations | Mock adapters with the exact request/response contract a live integration would use | No sandbox credentials exist for these government systems from this environment | Point the same functions at the real endpoints once partner sandbox access is granted — no calling code changes |
| Native React Native mobile app | Responsive PWA (installable, offline-shell caching via service worker) | A full native app isn't buildable/demoable in this environment | Wrap the same API in Expo/React Native if a native app becomes a requirement |
| Email/SMS delivery | "Dev Mailbox" outbox pattern — fully composed messages stored and viewable at Admin → Notifications Admin | No SMTP/Twilio credentials provisioned here | One-function swap in `utils/notify.ts`: replace the two outbox-insert calls with `nodemailer.sendMail(...)` / Twilio's `messages.create(...)` |
| Drag-and-drop BPMN workflow designer | Structured, form-based SLA/escalation editor (Admin → Workflow Configuration) that genuinely drives the scheduler | A full BPMN canvas was out of scope for the time available; this delivers the actual requirement (no-code configurability) honestly | Layer a visual designer on top of the same `workflow_configs` table later if desired |
| 300+ real institutions | 24 clearly-fictional institutions (all suffixed "(Demo)" or invented names) spread across all 10 provinces | Avoids attaching fabricated compliance/red-flag data to any real, identifiable Zimbabwean institution | Replace with the real institutional registry through the same `institutions` table/API — no schema change needed |

Nothing here is a stub that silently no-ops — every substitution above is a fully working
implementation of the underlying requirement, just on infrastructure this environment can
actually run.

---

## 7. Moving to a real production deployment

1. **Database:** migrate `schema.sql` to PostgreSQL (minimal dialect changes) and point
   `server/src/db/index.ts` at a `pg` connection pool instead of `better-sqlite3`.
2. **Secrets:** copy `server/.env.example` to `server/.env` and generate real values:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
   for `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `JWT_MFA_SECRET`.
3. **CORS:** set `CORS_ORIGIN` in `.env` to your real deployed frontend origin(s).
4. **Email/SMS:** wire real providers in `utils/notify.ts` (see table above).
5. **External integrations:** point `routes/mockExternal.routes.ts` and the eGP sync in
   `routes/procurement.routes.ts` at real partner endpoints once credentials are issued.
6. **Whistleblower key custody:** see the hardening note in §5.
7. **Process management:** run behind PM2 / systemd / a container orchestrator. The server
   already handles `SIGTERM`/`SIGINT` gracefully (closes the HTTP server and the DB connection
   cleanly) and exposes `GET /health` for liveness checks.
8. **Rate limiting:** the built-in limiter (`server/src/middleware/rateLimit.ts`) is in-memory,
   correct for one instance. Swap in a Redis-backed limiter before running multiple instances
   behind a load balancer.
9. **Reverse proxy / TLS:** put nginx or a cloud load balancer in front with HTTPS — the app
   itself serves plain HTTP.

---

## 8. Project structure

```
zacc-portal/
├── server/                       Node.js + TypeScript + Express API
│   ├── src/
│   │   ├── db/                   schema.sql, connection bootstrap, seed.ts
│   │   ├── middleware/            auth (JWT+RBAC), rate limiting, error handling
│   │   ├── utils/                 scoring, risk engine, workflow engine, crypto,
│   │   │                          notifications, AI heuristics, PDF/CSV generation,
│   │   │                          procurement rules, GIS clustering, MFA
│   │   ├── routes/                one file per module (19 route files)
│   │   ├── jobs/                  SLA escalation scheduler
│   │   ├── app.ts                 Express app assembly + static frontend serving
│   │   └── server.ts              entry point (HTTP + Socket.IO + graceful shutdown)
│   └── test/e2e.js                56-assertion end-to-end test covering every module
├── client/                       React 18 + TypeScript + Vite + Tailwind frontend
│   └── src/
│       ├── api/client.ts          typed fetch wrapper with auto token refresh
│       ├── context/               Auth + real-time Notification contexts
│       ├── components/            shared UI kit, layout shell, Zimbabwe map, compliance ring
│       ├── routes/                auth + role route guards
│       └── pages/                 public/, auth/, shared/, officer/, reviewer/, monitoring/,
│                                  committee/, institution/, investigations/, admin/
└── package.json                   root convenience scripts (install/build/seed/start/dev)
```

## 9. Running the test suite

```bash
cd server
npm run build
npm run seed
node dist/server.js &
node test/e2e.js
```

This exercises the full stack end to end: MFA enrolment, the complete assessment lifecycle
(draft → checklist → submit → approve → auto-generated recommendations → PDF report), systems
review duplicate detection, the whistleblower encryption round-trip, procurement red-flag rules,
GIS clustering, all six audit dashboard widgets, RBAC boundaries, and more — 56 assertions, all
passing against a freshly seeded database.

---

## 10. A note on design

The visual language (black + gold + a red accent, drawn from the real ZACC seal — see §12 —
paired with Fraunces/IBM Plex Sans/IBM Plex Mono, and the segmented
"compliance ring" motif used throughout) is original and deliberately grounded in the product's
actual mechanic: the ring's five segments are sized to the real weighting scheme (20/25/20/20/15),
not decoration. The Zimbabwe province map is a schematic cartogram (uniform tiles in
roughly-correct relative geography), not a traced administrative border map — a standard,
well-understood convention for this kind of dashboard that avoids asserting boundary precision
this build can't verify.

---

## 11. Troubleshooting

### "Everything returns a 500" after changing ports

**Symptom:** you changed the backend to a different port (because 4000 or 5173 was already
taken by something else) and now logins, registration, or every action fails with a 500 or a
network error.

**Cause:** in dev mode (`npm run dev`), the frontend (Vite) and backend run as two separate
processes on two separate ports, and the frontend proxies `/api` and `/socket.io` requests to
the backend. That proxy target used to be hardcoded — if you changed the backend's port without
also updating the proxy, every request from the frontend silently went to the *old* port
(where either nothing is listening, or some unrelated process is) instead of your server.

**Fix (already applied in this build):** both the dev server's own port and its proxy target are
now environment-driven:

```bash
# server/.env
PORT=4001

# client/.env
VITE_API_TARGET=http://localhost:4001
VITE_DEV_PORT=5174
```

Copy `server/.env.example` → `server/.env` and `client/.env.example` → `client/.env`, set both
to agree with each other, then restart both processes. `strictPort: true` is set on the Vite dev
server so if the configured port really is taken, Vite now **fails loudly** with a clear error
instead of silently picking a different port out from under you.

**Note:** this two-port proxy setup only exists in dev mode. In production
(`npm run build && npm run start`), the backend serves the built frontend itself — there is only
ever one port to configure (`server/.env`'s `PORT`), no proxy involved.

### Diagnosing any other 500

The error handler now logs the full stack trace, the request path, and the (password-redacted)
request body to the **server's terminal output** for every error — that terminal output is the
fastest way to see exactly what failed and why. The browser's Network tab (on the failing
request) also shows the same `{ "error": "..." }` message the server returned.

### MFA QR code won't scan / lost authenticator access

As Super Admin, go to **Users**, find the account, and click **Reset MFA** — they'll be prompted
to re-enrol (fresh QR code) on next login.

### "Too many attempts" (429) while testing login repeatedly

The rate limiter (`server/src/middleware/rateLimit.ts`) allows 10 attempts per email per 15
minutes on login/MFA endpoints. This is intentional brute-force protection; wait out the window
or restart the server (the limiter is in-memory and clears on restart).

---

## 12. Branding note

The palette is drawn directly from the real ZACC seal (the black-ringed badge with the gold
Zimbabwe Bird, red star, and mottled grey-stone backdrop, captioned "Our Values, Our Anchor"):

| Token | Hex | Where it comes from |
|---|---|---|
| `charcoal` | `#161512` | the seal's black ring |
| `gold` | `#D9A62E` | the Zimbabwe Bird, lettering, and chevron (Great Zimbabwe wall) pattern |
| `emblem` | `#CE1126` | the red five-pointed star |
| stone grey (inline, `ComplianceRing`'s "Internal Controls" segment) | `#5C5850` | the mottled granite backdrop |

Status colours (Red/Amber/Green for compliance ratings and risk bands) are deliberately kept as
the conventional traffic-light palette rather than matched to the brand — that convention needs
to read instantly to a compliance officer regardless of institutional branding, and reusing the
brand's own red for "non-compliant" would blur two different meanings into one colour.

These hex values are a careful visual read of the seal, not a pixel-picked extraction (this
environment can't run colour-extraction tools against an image). If you have the official brand
guideline with exact values, `client/tailwind.config.js` is the single, isolated place to correct
them — every component consumes these tokens rather than hardcoded colours, so a precise
correction is a config-file change, not a find-and-replace across the app.

The seal itself (the shield-and-checkmark mark used as the favicon and in the sidebar) is an
original design, not a reproduction of ZACC's actual emblem — it deliberately doesn't reproduce
the Zimbabwe Bird, the star, or the seal's text, only its colour story, to avoid any appearance of
reproducing an official government emblem.
