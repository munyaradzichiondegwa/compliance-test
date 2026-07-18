import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { db } from '../db';

// ============================================================================
// Mock External System Adapters — PRD Section 20 ("External System
// Integrations": ZACC ECMS, PRAZ eGP, OAG, JSC/NPA, Companies/National ID
// Registrar). None of these government systems expose a public sandbox this
// environment can reach, so this module stands in for them with the exact
// request/response contract a live integration would use — precisely the
// role a staging/mock service plays in any real integration project before
// partner sandbox credentials are issued. Swapping a real endpoint in later
// means changing the base URL in one place (see the comment on each route)
// with no change to any calling code elsewhere in the API.
// ============================================================================

const router = Router();
router.use(authenticate);
router.use(requireRole('SUPER_ADMIN', 'INVESTIGATIONS_OFFICER', 'PREVENTION_HEAD'));

// POST /api/v1/mock-external/ecms/case — mirrors what whistleblower.routes.ts /refer calls internally.
// Live equivalent: POST https://ecms.zacc.gov.zw/api/cases
router.post(
  '/ecms/case',
  asyncHandler(async (req, res) => {
    const { sourceType, sourceId, summary } = req.body || {};
    const caseId = `ECMS-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    res.json({ caseId, status: 'Opened', sourceType, sourceId, summary, openedAt: new Date().toISOString() });
  })
);

// GET /api/v1/mock-external/oag/findings — simulates receiving Office of the Auditor-General findings for cross-referencing.
// Live equivalent: GET https://oag.gov.zw/api/findings?institution=...
router.get(
  '/oag/findings',
  asyncHandler(async (req, res) => {
    const institutionId = req.query.institutionId as string | undefined;
    const inst = institutionId ? (db.prepare(`SELECT name FROM institutions WHERE id = ?`).get(institutionId) as any) : null;
    res.json({
      institution: inst?.name || 'All institutions',
      findings: [
        { ref: 'OAG-2025-0142', summary: 'Qualified opinion issued due to incomplete asset register.', year: 2025 },
        { ref: 'OAG-2025-0198', summary: 'Management letter raised on procurement documentation gaps.', year: 2025 },
      ],
    });
  })
);

// GET /api/v1/mock-external/jsc-npa/case-status/:caseId — simulates prosecutorial/judicial status sync.
// Live equivalent: GET https://npa.gov.zw/api/cases/:caseId/status
router.get(
  '/jsc-npa/case-status/:caseId',
  asyncHandler(async (req, res) => {
    res.json({ caseId: req.params.caseId, status: 'Under Prosecution Review', lastUpdated: new Date().toISOString(), court: 'Harare Magistrates Court (simulated)' });
  })
);

// GET /api/v1/mock-external/registrar/verify/:registrationNo — simulates Companies/National ID Registrar verification.
// Live equivalent: GET https://companies.gov.zw/api/verify/:registrationNo
router.get(
  '/registrar/verify/:registrationNo',
  asyncHandler(async (req, res) => {
    const inst = db.prepare(`SELECT name, registration_no FROM institutions WHERE registration_no = ?`).get(req.params.registrationNo) as any;
    res.json({ registrationNo: req.params.registrationNo, verified: !!inst, entityName: inst?.name || null, checkedAt: new Date().toISOString() });
  })
);

export default router;
