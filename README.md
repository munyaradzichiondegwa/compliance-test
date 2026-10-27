# ZACC Institutional Compliance Portal

<div align="center">

### Zimbabwe Anti-Corruption Commission
### Compliance, Systems and Processes Review

A working portal for the Commission's compliance, systems-and-processes review and monitoring function: from the first
complaint or programme item, through concept note, approvals, fieldwork, Implementation Matrix and report, to monitoring,
re-rating and certification.

![Node.js](https://img.shields.io/badge/Node.js-20_LTS-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-black?logo=express)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4-010101?logo=socketdotio)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3-38BDF8?logo=tailwindcss)

**Prepared for:** Zimbabwe Anti-Corruption Commission (ZACC) · **Developed by:** Bloodshed Munyaradzi Chiondegwa

</div>

---

## Contents

1. [What the portal does](#1-what-the-portal-does)
2. [Quick start](#2-quick-start)
3. [The engagement workflow](#3-the-engagement-workflow)
4. [The eight SOPs](#4-the-eight-sops)
5. [Generated documents](#5-generated-documents)
6. [Monitoring, registers and certification](#6-monitoring-registers-and-certification)
7. [Roles and access](#7-roles-and-access)
8. [Other modules](#8-other-modules)
9. [AI features and AI governance](#9-ai-features-and-ai-governance)
10. [Offline field capture, languages and accessibility](#10-offline-field-capture-languages-and-accessibility)
11. [Security](#11-security)
12. [Architecture and project structure](#12-architecture-and-project-structure)
13. [Configuration](#13-configuration)
14. [API overview](#14-api-overview)
15. [Testing](#15-testing)
16. [Deployment and the production path](#16-deployment-and-the-production-path)
17. [Known limitations](#17-known-limitations)
18. [Troubleshooting](#18-troubleshooting)
19. [License and support](#19-license-and-support)

---

## 1. What the portal does

| Area | What you get |
|------|--------------|
| **Compliance Work** | One workflow for all eight SOPs: preliminary assessment, concept note, approvals, notification letter, fieldwork, Implementation Matrix, report, monitoring. |
| **Documents on letterhead** | Concept note, memorandum, notification letter, report, landscape Implementation Matrix and monitoring notice as Word files; compliance certificate as PDF. |
| **Monitoring** | Three-month monitoring plan, Red → Amber → Green re-checks, the Electronic Compliance Monitoring Dashboard (ECMD), certificates valid for 12 months, regulator measures for non-compliant institutions. |
| **Registers** | Auditor-General / internal-audit / media findings library with repeat-finding detection; Devolution Funds and ZINARA acquittal tracker; government projects and programmes with verified progress; Integrity Committee deliverables and quarterly reports. |
| **Existing modules** | Institutional registry, scored compliance assessments, systems reviews with document versioning, recommendation tracker, corruption risk register, procurement red-flag monitoring, Integrity Committees and pledges, GIS map, encrypted whistleblower channel, reports, audit log. |
| **Controls** | Mandatory MFA, 14 roles, server-enforced institution and province scoping, SLA reminders and escalation, AI decision log with human review. |
| **Field use** | Offline-first capture of findings, interview minutes and meetings; English, Shona and Ndebele; accessibility work to WCAG 2.1 AA. |

---

## 2. Quick start

**Requirements:** Node.js 20+, npm, Git. No database server is needed; SQLite is bundled.

```bash
# from the repository root
npm run install:all     # installs server and client dependencies
npm run seed            # creates the schema and demonstration data
npm run dev             # starts server (4000) and client (5173)
```

Open <http://localhost:5173>.

| Command (repository root) | Purpose |
|---------------------------|---------|
| `npm run install:all` | Install `server/` and `client/` dependencies |
| `npm run seed` | **Drops and rebuilds** the demo database (never run against real data) |
| `npm run dev` | Development servers with reload |
| `npm run build` | Compile the server and build the client |
| `npm start` | Run the built server; it also serves `client/dist` on one port |
| `npm run setup` | install + seed + build |
| `npm run demo` | setup, then start |

| Service | Development URL |
|---------|-----------------|
| Client | <http://localhost:5173> (proxies `/api` and `/socket.io` to the server) |
| API | <http://localhost:4000/api/v1> |
| Health | <http://localhost:4000/health> |
| Built app (after `npm run build && npm start`) | <http://localhost:4000> |

### Demo accounts

All seeded accounts use the password **`ZaccDemo#2026`**. Every account must enrol an authenticator app (TOTP) on first sign-in.
The seeded accounts for approvers carry their position as the name.

| Position | Email |
|----------|-------|
| Super Administrator | `admin@zacc.gov.zw` |
| Commission Chairperson | `commission.chair@zacc.gov.zw` |
| Prevention and Corporate Governance Committee | `prevention.committee@zacc.gov.zw` |
| Executive Secretary | `exec.secretary@zacc.gov.zw` |
| General Manager, Prevention | `gm.prevention@zacc.gov.zw` |
| Manager, Compliance and Systems Review | `manager.compliance@zacc.gov.zw` |
| Provincial Head (Masvingo) | `provincial.head@zacc.gov.zw` |
| Compliance Officers | `officer1@`, `officer2@`, `officer3@zacc.gov.zw` |
| Systems Reviewers | `reviewer1@`, `reviewer2@zacc.gov.zw` |
| Monitoring Officers | `monitoring1@`, `monitoring2@zacc.gov.zw` |
| Auditor | `auditor@zacc.gov.zw` |
| Investigations Officer | `investigations@zacc.gov.zw` |
| Institution Focal Person | `focal.1@institution-demo.zw` |
| Integrity Committee Chair | `committee.chair.1@institution-demo.zw` |

Accounts created by an administrator receive a generated temporary password and must change it at first sign-in
(10 or more characters with upper case, lower case and a digit). **Delete or reset the demo accounts before real use.**

---

## 3. The engagement workflow

An *engagement* is one exercise at one institution. Every SOP uses the same engine (`server/src/engagement/sop.ts` holds the
data, `engine.ts` the rules).

```text
Preliminary assessment ─► Concept note ─► Approved ─► Notification letter ─► Fieldwork
   (2 working days)        (drafted,        (Executive    (signed by the        (RFD, meetings,
                            reviewed)        Secretary)    Executive Secretary)  interviews, findings)
                                                                                      │
        ┌─────────────────────────────────────────────────────────────────────────────┘
        ▼
Implementation Matrix ─► Report ─► Prevention Committee ─► Commission ─► Completed ─► Monitoring ─► Closed
(client comments,        (drafted    (recommends)           (Chairperson     (matrix         (3-month
 sign-off, approvals)     and                                approves)        published)      re-checks)
                          reviewed)
```

Statuses: `Preliminary`, `ConceptDraft`, `ConceptReview`, `Approved`, `Notified`, `Fieldwork`, `IMReview`, `ReportDraft`,
`ReportReview`, `Committee`, `Commission`, `Completed`, `Monitoring`, `Closed`, plus `Rejected` and `Cancelled`.

### Approval chains

| Stage | Chain |
|-------|-------|
| Preliminary assessment | Manager → General Manager. The General Manager decides the method (RFD, RR or PCC) where the SOP needs one, and whether deployment is justified (if not, the engagement is cancelled). |
| Concept note | Team Leader → *Provincial Head (provincial exercises only)* → Manager → General Manager → Executive Secretary. Integrity Committee Training and Pledge Signing use the short chain Manager → Executive Secretary. |
| Implementation Matrix | Team Leader → Manager → General Manager → Executive Secretary |
| Report | Team Leader → Manager → General Manager → Prevention and Corporate Governance Committee → Commission Chairperson |

At each step the approver can **approve / recommend, return for correction or reject** (rejection only for the preliminary
assessment and concept note). A comment is mandatory on return or reject. Every step is recorded with who, when and whether it
was on time.

### Timelines and escalation

Step allowances (working days): Team Leader 1, Provincial Head 1, Manager 1, General Manager 2, Executive Secretary 1,
Prevention Committee 10, Commission 10; report review steps use 2 / 2 / 3. An hourly scheduler:

- escalates a step that has run past its due time (once);
- reminds the Executive Secretary when a notification letter is overdue (due 2 days after approval);
- reminds the team when a report draft is overdue;
- alerts Monitoring Officers 14 days before monitoring is due;
- marks Integrity Committee deliverables overdue and expires certificates.

Each alert is sent once per engagement. Reminders for recommendations and assessments use the configurable workflow settings.
Administrators can trigger a sweep at once with `POST /api/v1/admin/run-scheduler`.

### Reference numbers

Engagements are numbered `ZACC/CSR/<year>/<nnn>`; notification letters `ZACC/PREV/CSR/<year>/<nnn>`.

### Who can do what on an engagement

| Action | Who |
|--------|-----|
| Create | Compliance Officer, Systems Reviewer, Monitoring Officer, Provincial Head, Manager, Super Admin |
| Allocate team (Team Leader, Focal Person, members) | Manager; the creator while still drafting |
| Edit concept note, record fieldwork and findings | Manager, creator and team members |
| Decide at a step | The role named for that step (Team Leader step: the engagement's Team Leader). Super Admin may act at any step. |
| Sign and issue the notification letter | Executive Secretary |
| Comment on the draft matrix and sign it for the institution | Institution Focal Person (own institution) |
| Send monitoring notice, record visits | Manager, officers, Monitoring Officer |
| Issue certificate | General Manager, Executive Secretary |
| Propose regulator measures | General Manager, Executive Secretary, Manager (non-compliant institutions only) |
| Cancel | Manager, General Manager, Executive Secretary |

Institution users see a **redacted view**: no budget, internal approvals or notes; the engagement only appears after the
notification letter is issued; the matrix is visible from the matrix review stage onwards.

---

## 4. The eight SOPs

| SOP | Minimum days | Matrix | Report | Monitoring | Notes |
|-----|:-----------:|:------:|:------:|:----------:|-------|
| Compliance Assessment (spot, desk or comprehensive check) | 2 | ✔ | ✔ | ✔ | Method RFD / RR / PCC set by the General Manager |
| Systems and Processes Review | 10 | ✔ | ✔ | ✔ | Systems and Processes Matrix |
| Monitoring of Audit Recommendations | 2 | | ✔ | | |
| Monitoring of Government Funded Projects | 2 | | ✔ | | |
| Monitoring of Government Funded Programmes | 2 | | ✔ | | |
| Monitoring of Integrity Committee Initiatives | 2 | | ✔ | | |
| Integrity Committee Training | 1 | | | ✔ | Completed with a return form (see below) |
| Integrity Pledge Signing | 1 | | | ✔ | Completed with the ceremony record (see below) |

Each SOP supplies its triggers, default objectives, methodology, expected outcomes, the list of documents to request and how
compliance is evaluated, so the concept note can be filled from the SOP in one click.

**Integrity Committee Training** completes with: training date, members trained (at least three), and whether HRM, Legal and
Audit are represented, plus topics and trainers. The return form schedules four deliverables due 30 days later: corruption risk
matrix, integrity action plan, integrity charter and workplan.

**Pledge Signing** completes with the ceremony date, number signed, Commissioner of Oaths and **three printed copies**
(individual, HR file, ZACC). A pledge record is created; pledges are renewable annually.

### Concept note contents

Title, what prompted the exercise, kind of check, background, allegations (or rationale), scope, objectives, methodology,
expected outcomes, dates and days, **team** (one Team Leader, one Focal Person, members), **itinerary** by day (activity type and
distance), **budget in USD** (quantity × unit cost × persons × days; a standard template for fuel, accommodation and meals) and a
request-for-documents register. Objectives and methodology can be suggested from the allegations (tenders, recruitment, land,
funds, interference, assets).

### Fieldwork records

Entrance and exit meetings, interview minutes (kept by the Team Leader), the RFD register (Requested / Received / Outstanding /
Not available) and findings: issue, finding points, legal reference, category, severity, rating (Compliant / Partially
compliant / Non-compliant), recommendation, responsibility, time frame, due date and an optional **referral to Investigations**
for suspected corruption outside the compliance mandate. A single finding can also be added without touching the rest of the
matrix (used by offline capture).

---

## 5. Generated documents

Generated on demand from the stored data, on the ZACC letterhead (contact blocks either side of the colour logo, black-and-white
tables, USD budgets). Download buttons are on the engagement page; the API is `GET /api/v1/engagements/:id/docs/:kind`.

| Kind | Format | Content |
|------|--------|---------|
| `concept-note` | Word | Background, allegations, objectives, scope, methodology, team, resource requirements, expected outcomes, sign-off blocks |
| `memorandum` | Word | Unit → General Manager and General Manager → Executive Secretary memoranda with the budget |
| `notification-letter` | Word | Letter to the institution, signed by the Executive Secretary |
| `report` | Word | Compliance Assessment / Systems Report with team, findings and conclusion |
| `matrix` | Word (landscape) | Implementation Matrix with the level of compliance and signature lines for both parties |
| `monitoring-notice` | Word | Notice of the monitoring visit |
| `certificate` | PDF | Compliance certificate (landscape, double border, logo) |

Approvers appear **by position only** on letters and sign-off blocks (for example "General Manager Prevention and Corporate
Governance"), not by personal name. Team Leader and Focal Person names are printed.
Institution users can download only the notification letter and the matrix. The matrix is also available as CSV.

---

## 6. Monitoring, registers and certification

### Ratings

An engagement's level comes from its findings (Compliant findings are ignored):
**Green** = every recommendation implemented, **Red** = none implemented, otherwise **Amber**.
Monitoring is due **three months** after completion. Each monitoring visit updates the status of every recommendation and
re-rates the institution, so movement Red → Amber → Green is recorded. Updating a recommendation in the recommendation tracker
updates the matching matrix row, and the reverse.

### Pages (left-hand navigation, depending on role)

| Page | What it shows |
|------|---------------|
| **ECMD** | Latest rating for every institution with a completed assessment or review, rating history, next monitoring date, certificate and open regulator measures |
| **Monitoring plan** | Per quarter: monitoring visits (including overdue), Red follow-ups, certificate expiries, Integrity Committee deliverables, fund acquittals outstanding; printable |
| **Audit findings** | Auditor-General (IPSAS), internal audit and media findings by institution and year; repeat findings across years detected by text similarity; bulk import; "Track" turns a finding into a recommendation with reminders and escalation |
| **Funds** | Devolution Funds, ZINARA and other disbursements with spent, legacy debt paid and variance. Flags: acquittal overdue (60 days after quarter end), legacy debt above 40%, overspent, acquitted with variance. CSV export |
| **Projects and programmes** | Budget and spend, reported progress against progress **verified on site**; flags for reporting ahead of verification, spend ahead of progress, past end date |
| **IC monitoring** | Integrity Committees: deliverables, quarterly reports, annual impact assessment, training return forms |
| **Certificates** | Certificates (Green only, valid 12 months, expiry warnings) and regulator measures (limit devolution funds, suspend government contracts, suspend tax holidays, stock-exchange delisting, other) with approval status |

---

## 7. Roles and access

Fourteen roles. Team Leader and Focal Person are per-engagement roles, not accounts types.

| Role | Main responsibility |
|------|---------------------|
| `SUPER_ADMIN` | Platform administration, users, workflow settings, audit log, can act at any approval step |
| `COMMISSION_CHAIR` | Approves reports (Commission stage) |
| `PREVENTION_COMMITTEE` | Recommends reports (Prevention and Corporate Governance Committee stage) |
| `EXECUTIVE_SECRETARY` | Approves concept notes and matrices; signs notification letters; issues certificates |
| `GM_PREVENTION` | General Manager, Prevention and Corporate Governance: recommends at every stage, decides method, issues certificates |
| `MANAGER_COMPLIANCE` | Manager, Compliance and Systems Review: allocates teams, recommends, oversees monitoring |
| `PROVINCIAL_HEAD` | Reviews provincial exercises; sees **only their province** |
| `COMPLIANCE_OFFICER` | Plans and conducts compliance exercises; can be Team Leader |
| `SYSTEMS_REVIEWER` | Conducts systems and processes reviews |
| `MONITORING_OFFICER` | Verifies recommendations, monitoring visits and notices |
| `AUDITOR` | Read access to audit-oriented dashboards, findings library and AI log |
| `INVESTIGATIONS_OFFICER` | Whistleblower cases and referrals |
| `INSTITUTION_FOCAL_PERSON` | Institution-side contact: responds to recommendations, comments on and signs the matrix |
| `INTEGRITY_COMMITTEE_CHAIR` | Institution-side Integrity Committee management and deliverables |

### Scoping (enforced on the server, not only in the interface)

- **Institution roles** are pinned to their own institution. A record id belonging to another institution returns `404`;
  exports, registers and bulk operations are refused; staff-only modules return `403`.
- **Provincial Heads** are pinned to their province in the registers, ECMD, monitoring plan, institutions, assessments,
  recommendations, committees and dashboard totals; asking for another province returns `403`.
- Staff-only modules (systems reviews, procurement, reports, AI, GIS detail, workflow configuration, AI governance) are closed to
  institution users.

---

## 8. Other modules

| Module | Highlights |
|--------|------------|
| **Institutional registry** | Name, type, sector, ownership, province, district, coordinates, risk level, history, summary |
| **Compliance assessments** | Checklist by section with weights Governance 20%, Internal Controls 25%, Procurement 20%, Financial Management 20%, Integrity 15%; Compliant = 100, Partially compliant = 50, Non-compliant = 0; composite score ≥ 75 **Green**, ≥ 50 **Amber**, otherwise **Red**; evidence upload (15 MB limit) and geotags; submission and review workflow with SLA |
| **Systems reviews** | Findings, versioned documents with download, duplicate-finding detection, status workflow, SLA escalation (once) |
| **Recommendation tracker** | Created → Assigned → Response submitted → Closed (or Incomplete), evidence upload, verification by Monitoring Officer, reminder and escalation levels, CSV register |
| **Corruption risk register** | Likelihood × impact (score ≥ 20 Critical, ≥ 13 High, ≥ 6 Medium, otherwise Low), residual risk from control effectiveness, mitigations, heat map, trends, CSV |
| **Procurement monitoring** | Red flags: single source above USD 25,000, split purchases (above USD 40,000 combined, same supplier and institution within 30 days), supplier concentration (one supplier across 3 or more institutions in 60 days), among others |
| **Integrity Committees** | Registration, charter, members, trainings, meetings, action plans |
| **Integrity pledges** | Pledges, signatories, bulk upload, ceremony (three copies), renewal, expiry reminders |
| **Whistleblower** | See [Security](#11-security); anonymous submission with tracking code, investigation workflow, access log, referral |
| **GIS** | Province map (public aggregate), institution layer, compliance and risk heat maps |
| **Dashboards and reports** | Overview tiles scoped to the user; overdue-recommendation ageing, high-risk institutions, implementation rate; awaiting-my-action list; reports and CSV exports |
| **Notifications** | In-app (live push), email and SMS outbox; per-user preferences; 25 templates including every engagement step, reminder and escalation |
| **Audit log** | Immutable record of sensitive actions and status transitions |
| **Search** | Natural-language search across records |

---

## 9. AI features and AI governance

The AI features are **deterministic, rule-based and explainable**; no external language model is called.

| Feature | Method |
|---------|--------|
| Assessment narrative draft | Template assembled from checklist responses and section scores |
| Systems review summary | Extractive: highest-scoring sentences are kept verbatim |
| Duplicate-finding detection | Word-set similarity (Jaccard) |
| Risk trend prediction | Ordinary least-squares line through past composite scores |
| Natural-language search | Keyword relevance ranking |

**Governance controls (page *AI governance*):**

- Every AI output is logged with model version, input summary, output and an explanation (method, limitations, factors, confidence).
- A named officer must **Accept**, **Modify** or **Override** it; a reason is required for Modify and Override; an output can be reviewed once.
  A drafted narrative is stored as a proposal and applied to the assessment only when accepted or modified.
- The **bias and override monitor** (General Manager, Manager, Auditor, Super Admin) reports override rates per feature
  and per reviewer, and compares adverse AI outcomes across provinces and institution types, with alerts for high override
  rates or disparities.

---

## 10. Offline field capture, languages and accessibility

**Field capture** (`/app/field-capture`) records findings, interview minutes and meetings against an engagement in Fieldwork,
optionally stamped with the GPS position. When the device is offline, records go into an on-device queue (IndexedDB) and upload
**in order** when the connection returns. A record the server rejects is marked failed and shown for discarding, so one bad
record never blocks the rest. The queue holds only records not yet uploaded. The app shell is cached for offline start;
**authenticated API responses are never cached**, and the cached engagement list is removed at sign-out.

**Languages:** English, Shona and Ndebele, chosen in the header or in Settings, applied to navigation and common actions.
Case content stays in the language it was written in. *Shona and Ndebele wording must be reviewed by native speakers before
release.*

**Accessibility (aiming at WCAG 2.1 AA):** skip link, labelled form controls, dialog semantics with focus trap and Escape,
`role="switch"` for toggles, table captions and header scopes, visible focus, status and alert announcements, text labels for
all status colours, print styles (black and white, no navigation) for plans and registers. A full audit with assistive
technology users is still recommended.

---

## 11. Security

| Control | Detail |
|---------|--------|
| Authentication | Email and password (bcrypt), then **mandatory TOTP MFA** (enrolment at first sign-in); short-lived access token and refresh token |
| Password policy | 10+ characters with upper case, lower case and a digit; temporary passwords are random and must be changed at first sign-in (until then the session can only change the password); a password change revokes other sessions |
| Throttling | Sign-in and MFA attempts limited to 10 per 15 minutes per account (by email, or by user within an MFA challenge), falling back to IP |
| Authorisation | Role checks on every route plus institution and province scoping in middleware |
| Production safety | The server refuses to start in production without `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` and `JWT_MFA_SECRET`; unexpected errors return a generic message |
| Transport and headers | Helmet headers, CORS limited to `CORS_ORIGIN`, compression; run behind HTTPS in production |
| Exports | CSV cells starting `=`, `+`, `-` or `@` are neutralised against spreadsheet formula injection |
| Whistleblower channel | The report is encrypted **in the reporter's browser** with a random AES-256-GCM key, which is wrapped with the Investigations RSA-OAEP public key. The server stores only ciphertext; an Investigations Officer opening a report decrypts it with the server's private key and the access is logged. A tracking code lets the reporter follow progress anonymously. |
| Audit | Sensitive actions and every status transition are recorded and cannot be edited |

> **Key custody:** the whistleblower private key is generated on first start and stored in `DATA_DIR/keys`. It is not zero-knowledge
> against a fully compromised server. Before real reporters use the channel, move the key into an HSM or vault, or split it
> among custodians.

---

## 12. Architecture and project structure

```text
 Browser (React 18 PWA, offline outbox, i18n)
        │  HTTPS   REST /api/v1  +  Socket.IO
        ▼
 Express API ── auth · scope · role checks · rate limit
        │
        ├── Engagement engine (SOP data, chains, SLAs, decisions)
        ├── Document builders (docx, pdfkit)         ├── Scheduler (hourly node-cron)
        ├── Monitoring registers, ECMD, plan          ├── Notification service (in-app, email/SMS outbox)
        ├── AI helpers + AI governance log            └── Whistleblower crypto
        ▼
 SQLite (better-sqlite3, WAL)  +  uploads on disk      → production path: PostgreSQL + object storage
```

```text
.
├── package.json                 root scripts (install:all, seed, dev, build, start, setup, demo)
├── IMPROVEMENTS.md              what was built against the improvement review
├── docs/MIGRATION.md            PostgreSQL / object-storage path
├── server/
│   ├── .env.example
│   ├── assets/                  letterhead logo
│   ├── data/                    created at run time: database, uploads, keys (git-ignored)
│   ├── test/e2e.js              end-to-end test (181 checks)
│   └── src/
│       ├── app.ts, server.ts, socket.ts
│       ├── db/                  schema.sql, seed.ts, index.ts
│       ├── engagement/          sop.ts (the eight SOPs), engine.ts (workflow rules)
│       ├── docs/                layout.ts (letterhead), builders.ts (Word), certificate.ts (PDF)
│       ├── jobs/scheduler.ts    reminders, escalation, expiry
│       ├── middleware/          auth, scope, rateLimit, errorHandler
│       ├── routes/              one file per module
│       └── utils/               scoring, riskEngine, procurementRules, ai, aiGov, crypto, notify, jwt, mfa, csv, pdf, gis
└── client/
    ├── vite.config.ts           PWA (offline shell only)
    └── src/
        ├── pages/               engagements, registers, officer, reviewer, monitoring, committee,
        │                        institution, investigations, admin, shared, public, auth
        ├── components/          layout (navigation by role), common UI
        ├── i18n/                English, Shona, Ndebele
        ├── offline/             on-device queue, online status
        └── context/, api/, routes/, types/
```

**Technology:** Node.js 20, TypeScript, Express, better-sqlite3, Socket.IO, node-cron, docx, pdfkit, bcryptjs, jsonwebtoken, otplib;
React 18, Vite 5, Tailwind CSS 3, React Router 6, Recharts, lucide-react, vite-plugin-pwa (Workbox).

---

## 13. Configuration

Copy `server/.env.example` to `server/.env`. In production all three secrets are required.

| Variable | Purpose |
|----------|---------|
| `NODE_ENV` | `production` enables the secret checks |
| `PORT` | API port (default 4000) |
| `CORS_ORIGIN` | Comma-separated browser origins allowed to call the API |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_MFA_SECRET` | Token signing secrets. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `DATA_DIR` | Folder for the database, uploads and whistleblower keys; use a mounted, backed-up volume |

Client development settings (`client/.env`): `VITE_DEV_PORT` (default 5173) and `VITE_API_TARGET` (default `http://localhost:4000`).

---

## 14. API overview

Base URL: `/api/v1`. All routes except the public ones need `Authorization: Bearer <access token>`.

| Area | Routes |
|------|--------|
| Auth (public) | `POST /auth/login`, `/auth/mfa/setup/verify`, `/auth/mfa/challenge`, `/auth/refresh`, `/auth/logout`; `GET /auth/me`; `POST /auth/change-password` |
| Whistleblower (public) | `GET /whistleblower/institutions`, `/public-key`, `/track/:code`; `POST /whistleblower/submit` |
| Engagements | `GET /engagements`, `/engagements/meta`, `/engagements/:id`, `/engagements/distance`; `POST /engagements`, `/engagements/suggest`; `PUT /engagements/:id`, `/:id/team`, `/:id/budget`, `/:id/itinerary`, `/:id/findings`; `POST /:id/preliminary`, `/:id/draft-concept`, `/:id/budget-template`, `/:id/submit-concept`, `/:id/decision`, `/:id/notification`, `/:id/start`, `/:id/documents`, `/:id/meetings`, `/:id/interviews`, `/:id/findings/add`, `/:id/conclude`, `/:id/im/sign`, `/:id/report/submit`, `/:id/complete-simple`, `/:id/monitoring/notice`, `/:id/monitoring/visit`, `/:id/certificate`, `/:id/regulator-notices`, `/:id/cancel`; downloads `GET /:id/docs/:kind`, `/:id/matrix.csv` |
| Monitoring | `GET /monitoring/ecmd`, `/plan`, `/certificates`, `/regulator-notices`, `/libraries`, `/audit-findings` (+ `/summary`), `/funds` (+ `/export.csv`), `/programmes`, `/ic/overview`; `POST /monitoring/audit-findings` (+ `/import`, `/:id/recommend`), `/funds`, `/programmes`, `/programmes/:id/reports`, `/ic/deliverables/:id/submit`, `/ic/quarterly-reports`, `/ic/return-forms`; `PUT /funds/:id`, `/programmes/:id/reports/:rid/verify`, `/regulator-notices/:id/status` |
| AI governance | `GET /ai-governance/decisions`, `/decisions/:id`, `/bias`; `POST /ai-governance/decisions/:id/review` |
| Institutions | `GET/POST /institutions`, `GET/PUT /institutions/:id`, `/:id/assessments`, `/:id/summary`, `/:id/history` |
| Assessments | `GET/POST /assessments`, `/:id/checklist`, `/:id/evidence`, `/:id/geotag`, `/:id/ai-draft`, `/:id/submit`, `/:id/review`, `/:id/report` |
| Systems reviews | `GET/POST /systems-reviews`, `/:id/status`, `/:id/documents`, `/:id/findings`, `/findings/:id/duplicates` |
| Recommendations | `GET /recommendations`, `/register/export.csv`; `POST /:id/respond`, `/:id/evidence`; `PUT /:id/verify` |
| Risk register, procurement, committees, pledges | `/risk-register`, `/procurement`, `/committees`, `/pledges` (including `/pledges/:id/ceremony` and `/renew`) |
| Platform | `/users`, `/dashboard`, `/gis`, `/reports`, `/ai`, `/notifications`, `/workflow-configs`, `/audit-logs`, `/admin/run-scheduler`, `/mock-external` (demonstration adapters), `GET /health` |

---

## 15. Testing

`server/test/e2e.js` drives the running API through 24 sections (181 checks): authentication and MFA, role and scope
enforcement, the full lifecycle of an engagement, all six document types and the certificate, return and reject rules, simple
SOP completion, registers, ECMD and plan, AI governance, the scheduler and temporary-password handling.

```bash
cd server
npm run seed                       # the test needs a freshly seeded database (MFA secrets are created per run)
PORT=4000 npm run dev              # in one terminal
npm run test:e2e                   # in another
```

Type checks: `npx tsc --noEmit` in `server/` and in `client/`. The client build is `npm run build` in `client/`.

---

## 16. Deployment and the production path

**Single-server deployment:** `npm run setup` (or install, seed once, build), set the environment variables, then `npm start`.
The server serves the built client and the API on one port. Put it behind a TLS-terminating reverse proxy (for example Nginx),
run it under a process manager, and back up `DATA_DIR`. Do **not** run `npm run seed` on a live installation.

**Scaling to PostgreSQL and object storage:** [docs/MIGRATION.md](docs/MIGRATION.md) lists the schema translation, query changes,
cut-over steps, storage interface and operations checklist. Notes for more than one instance: run the scheduler on exactly one
instance, and use sticky sessions or a Redis adapter for Socket.IO.

No container files are shipped.

---

## 17. Known limitations

- **Email and SMS** are written to outboxes (`email_outbox`, `sms_outbox`); no SMTP or SMS gateway is connected yet.
- **External systems** (case management, Auditor-General feed, judicial status) are demonstration adapters under `/mock-external`.
- **AI** is rule-based; it has no language model and cannot read evidence documents.
- **Shona and Ndebele** need native-speaker review; coverage is navigation and common actions.
- **Distances and fuel** use straight-line distance with a road factor and must be confirmed against actual routes.
- **SQLite** suits a pilot or single office; use the PostgreSQL path for national roll-out.
- **Whistleblower key custody** (see [Security](#11-security)).
- **Demo data and demo accounts** must be removed before real use.

---

## 18. Troubleshooting

| Problem | Likely cause and fix |
|---------|----------------------|
| Server stops at start in production | One of the three JWT secrets is missing |
| Sign-in says too many attempts | Wait 15 minutes; the limit is per account |
| Authenticator code rejected | Device time is wrong; enable automatic time |
| MFA enrolment screen no longer appears | The account is already enrolled; use the code from the authenticator app. After a re-seed, enrolment starts again |
| Test run fails on sign-in | Re-seed before every run of `npm run test:e2e` |
| Client shows blank data in development | Server not running, or `VITE_API_TARGET` points at the wrong port |
| An engagement does not appear for an institution user | It only appears after the Executive Secretary issues the notification letter |

---

## 19. License and support

**Proprietary Government Software.** Developed for the Zimbabwe Anti-Corruption Commission (ZACC). Unauthorised copying,
modification, redistribution, reverse engineering or commercial use without written permission is prohibited.

**Developer:** Bloodshed Munyaradzi Chiondegwa — Software Developer | Financial Consultant | Business Systems Architect, Harare, Zimbabwe.

© 2026 All rights reserved.
