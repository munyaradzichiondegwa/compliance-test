# Portal improvements — ZACC Compliance, Systems and Processes Review alignment

Basis: PRD v4.0; the Compliance Procedure Manual and the SOPs for compliance assessments, systems reviews, audit-recommendation monitoring, government projects and programmes monitoring, Integrity Committee initiatives monitoring, Integrity Committee training and pledge signing; the Chirundu and Sanyati reports; the concept-note → memorandum → approval workflow.

**Status: every item below is built and covered by `server/test/e2e.js` (`npm run test:e2e`, 181 checks).**

## 1. One engagement engine for all eight SOPs
All eight SOPs run through a single data-driven engine (`server/src/engagement/sop.ts`, `engine.ts`): Compliance Assessment (spot / desk / comprehensive), Systems Review, Audit Recommendations Monitoring, Government Projects Monitoring, Government Programmes Monitoring, Integrity Committee Initiatives Monitoring, Integrity Committee Training and Pledge Signing.

Lifecycle: Preliminary assessment (2 working days; Manager → GM decides method RFD / RR / PCC and whether deployment is justified) → Concept note (Team Leader → Provincial Head if provincial → Manager → GM → Executive Secretary) → Notification letter signed by the Executive Secretary → Fieldwork (RFD register, entrance/exit meetings, interview minutes, findings) → Implementation Matrix (client comments and sign-off) → Report (Team Leader → Manager → GM → Prevention Committee → Commission Chair) → Monitoring. Every step has an SLA, reminders and escalation; returned items go back with mandatory comments.

## 2. Roadmap items from the previous review
| # | Item | Where |
|---|------|-------|
| 1 | Word/PDF generation on ZACC letterhead: concept note, memorandum, notification letter, report, landscape Implementation Matrix, monitoring notice (.docx) and compliance certificate (PDF) | `server/src/docs/*`; `GET /engagements/:id/docs/:kind` |
| 2 | Auditor-General / IPSAS / internal-audit / media findings library with repeat-finding detection, bulk import and "track as recommendation" | `/monitoring/audit-findings*`; page *Audit findings* |
| 3 | Devolution Funds and ZINARA acquittal tracker (disbursed vs spent vs legacy debt; overdue, overspent and variance flags; CSV) | `/monitoring/funds*`; page *Funds* |
| 4 | Quarterly monitoring plan (visits, Red follow-ups, certificate expiry, IC deliverables, fund acquittals) and Red → Amber → Green re-checks driving the ECMD | `/monitoring/plan`, `/monitoring/ecmd`; pages *Monitoring plan*, *ECMD* |
| 5 | Production path to PostgreSQL / object storage (`docs/MIGRATION.md`, `DATA_DIR`); per-province scoping for Provincial Heads and per-institution pinning for institution roles, enforced server-side | `middleware/scope.ts`, `routes/monitoring.routes.ts` |
| 6 | Offline-first field capture (on-device outbox, ordered replay, GPS stamp), English / Shona / Ndebele, WCAG 2.1 AA work (labels, dialog semantics and focus trap, switch roles, table captions, skip link, visible focus) | `client/src/offline`, `client/src/i18n`, `pages/registers/FieldCapture.tsx` |
| 7 | AI governance: every AI output logged with model version, inputs, explanation; human Accept / Modify / Override with mandatory reason; bias and override monitoring by province and institution type | `utils/aiGov.ts`, `routes/aiGovernance.routes.ts`; page *AI governance* |
| 8 | Systems-review escalation no longer re-notifies on every sweep (`escalated` flag) | `jobs/scheduler.ts` |

## 3. Things that existed but were not fully executed, now completed
- Pledge signing creates the pledge record, ceremony needs three copies, renewals supported.
- Integrity Committee training return form schedules the four 30-day deliverables; quarterly and annual impact reports.
- Recommendation response / verification now updates the Implementation Matrix row (and vice versa from monitoring visits).
- Compliance certificates (valid 12 months, Green only) and regulator measures for non-compliant institutions.
- Notification templates for every engagement step, reminder and escalation.
- Institution users are pinned to their own institution (record ids elsewhere return 404, exports blocked, staff-only modules 403).
- Security: forced password change for temporary passwords (10+ characters, mixed), crypto-generated temporary passwords, token revocation on password change, MFA throttling per account, generic 5xx messages, production refuses to boot without JWT secrets, CSV formula-injection neutralised, the PWA no longer caches authenticated API responses.

## 4. Needs a human decision before go-live
- **Shona and Ndebele wording** covers navigation and common actions and must be reviewed by native speakers.
- **Demo accounts** share one password and are for pilots only; delete or reset them before production.
- **Real office holders** (Executive Secretary, GM, Manager, committee chairs) appear in letters and sign-off blocks; confirm the names and designations for your issue date.
- **Distances and fuel** use straight-line distance with a road factor; confirm with your transport unit.
- **PostgreSQL / object storage** is a documented path, not yet switched on.
