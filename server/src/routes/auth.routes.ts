import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { signAccessToken, signRefreshToken, verifyRefreshToken, signMfaChallengeToken, verifyMfaChallengeToken } from '../utils/jwt';
import { generateMfaSecret, buildOtpAuthUrl, generateQrCodeDataUrl, verifyMfaToken } from '../utils/mfa';
import { authenticate } from '../middleware/auth';
import { writeAudit } from '../utils/audit';
import { asyncHandler } from '../middleware/errorHandler';
import { rateLimit } from '../middleware/rateLimit';

const router = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, keyPrefix: 'login' });
const mfaLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, keyPrefix: 'mfa' });

interface UserRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  password_hash: string;
  role: string;
  institution_id: string | null;
  mfa_enabled: number;
  mfa_secret: string | null;
  is_active: number;
}

function sanitize(user: UserRow) {
  return { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, institutionId: user.institution_id, mfaEnabled: !!user.mfa_enabled };
}

function issueSession(user: UserRow, res: any) {
  const access = signAccessToken({ sub: user.id, role: user.role, name: user.name, institutionId: user.institution_id });
  const refresh = signRefreshToken(user.id);
  const refreshHash = bcrypt.hashSync(refresh, 8);
  db.prepare(`INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, datetime('now', '+7 days'), datetime('now'))`).run(uuid(), user.id, refreshHash);
  db.prepare(`UPDATE users SET last_login = datetime('now') WHERE id = ?`).run(user.id);
  return res.json({ accessToken: access, refreshToken: refresh, user: sanitize(user) });
}

// POST /api/v1/auth/login
router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(String(email).toLowerCase()) as UserRow | undefined;
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      writeAudit({ action: 'LOGIN_FAILED', entityType: 'user', entityId: user.id, details: { email } });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.mfa_enabled) {
      // First login (or MFA not yet enrolled) — mandatory TOTP enrolment (Section 19.1).
      const secret = generateMfaSecret();
      db.prepare(`UPDATE users SET mfa_secret = ? WHERE id = ?`).run(secret, user.id);
      const otpAuthUrl = buildOtpAuthUrl(user.email, secret);
      const qrCodeDataUrl = await generateQrCodeDataUrl(otpAuthUrl);
      const tempToken = signMfaChallengeToken(user.id, 'setup');
      return res.json({ mfaSetupRequired: true, tempToken, qrCodeDataUrl, otpAuthUrl, manualEntryKey: secret });
    }

    const tempToken = signMfaChallengeToken(user.id, 'challenge');
    return res.json({ mfaChallengeRequired: true, tempToken });
  })
);

// POST /api/v1/auth/mfa/setup/verify
router.post(
  '/mfa/setup/verify',
  mfaLimiter,
  asyncHandler(async (req, res) => {
    const { tempToken, token } = req.body || {};
    if (!tempToken || !token) return res.status(400).json({ error: 'tempToken and token are required' });
    let decoded;
    try {
      decoded = verifyMfaChallengeToken(tempToken);
    } catch {
      return res.status(401).json({ error: 'MFA session expired — please log in again' });
    }
    if (decoded.purpose !== 'setup') return res.status(400).json({ error: 'Wrong MFA stage' });

    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(decoded.sub) as UserRow | undefined;
    if (!user || !user.mfa_secret) return res.status(404).json({ error: 'User not found' });

    if (!verifyMfaToken(String(token), user.mfa_secret)) {
      return res.status(401).json({ error: 'Incorrect authenticator code — please try again' });
    }
    db.prepare(`UPDATE users SET mfa_enabled = 1 WHERE id = ?`).run(user.id);
    writeAudit({ userId: user.id, action: 'MFA_ENROLLED', entityType: 'user', entityId: user.id });
    user.mfa_enabled = 1;
    return issueSession(user, res);
  })
);

// POST /api/v1/auth/mfa/challenge
router.post(
  '/mfa/challenge',
  mfaLimiter,
  asyncHandler(async (req, res) => {
    const { tempToken, token } = req.body || {};
    if (!tempToken || !token) return res.status(400).json({ error: 'tempToken and token are required' });
    let decoded;
    try {
      decoded = verifyMfaChallengeToken(tempToken);
    } catch {
      return res.status(401).json({ error: 'MFA session expired — please log in again' });
    }
    if (decoded.purpose !== 'challenge') return res.status(400).json({ error: 'Wrong MFA stage' });

    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(decoded.sub) as UserRow | undefined;
    if (!user || !user.mfa_secret) return res.status(404).json({ error: 'User not found' });

    if (!verifyMfaToken(String(token), user.mfa_secret)) {
      writeAudit({ userId: user.id, action: 'MFA_CHALLENGE_FAILED', entityType: 'user', entityId: user.id });
      return res.status(401).json({ error: 'Incorrect authenticator code' });
    }
    writeAudit({ userId: user.id, action: 'LOGIN_SUCCESS', entityType: 'user', entityId: user.id });
    return issueSession(user, res);
  })
);

// POST /api/v1/auth/refresh
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body || {};
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken is required' });
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      return res.status(401).json({ error: 'Refresh token invalid or expired' });
    }
    const rows = db.prepare(`SELECT * FROM refresh_tokens WHERE user_id = ? AND revoked = 0 AND expires_at > datetime('now')`).all(decoded.sub) as { id: string; token_hash: string }[];
    const match = rows.find((r) => bcrypt.compareSync(refreshToken, r.token_hash));
    if (!match) return res.status(401).json({ error: 'Refresh token not recognised' });

    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(decoded.sub) as UserRow | undefined;
    if (!user || !user.is_active) return res.status(401).json({ error: 'Account not available' });

    const access = signAccessToken({ sub: user.id, role: user.role, name: user.name, institutionId: user.institution_id });
    return res.json({ accessToken: access, user: sanitize(user) });
  })
);

// POST /api/v1/auth/logout
router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body || {};
    if (refreshToken) {
      try {
        const decoded = verifyRefreshToken(refreshToken);
        const rows = db.prepare(`SELECT * FROM refresh_tokens WHERE user_id = ? AND revoked = 0`).all(decoded.sub) as { id: string; token_hash: string }[];
        const match = rows.find((r) => bcrypt.compareSync(refreshToken, r.token_hash));
        if (match) db.prepare(`UPDATE refresh_tokens SET revoked = 1 WHERE id = ?`).run(match.id);
      } catch {
        /* already invalid — nothing to revoke */
      }
    }
    return res.json({ ok: true });
  })
);

// GET /api/v1/auth/me
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user!.sub) as UserRow | undefined;
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json(sanitize(user));
  })
);

// POST /api/v1/auth/change-password
router.post(
  '/change-password',
  authenticate,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    if (String(newPassword).length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user!.sub) as UserRow;
    if (!bcrypt.compareSync(currentPassword, user.password_hash)) return res.status(401).json({ error: 'Current password is incorrect' });
    const newHash = bcrypt.hashSync(newPassword, 10);
    db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(newHash, user.id);
    writeAudit({ userId: user.id, action: 'PASSWORD_CHANGED', entityType: 'user', entityId: user.id });
    return res.json({ ok: true });
  })
);

export default router;
