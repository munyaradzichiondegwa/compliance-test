import jwt from 'jsonwebtoken';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'zacc-dev-access-secret-change-in-production';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'zacc-dev-refresh-secret-change-in-production';

export interface AccessTokenPayload {
  sub: string; // user id
  role: string;
  name: string;
  institutionId: string | null;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: '15m' });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, ACCESS_SECRET) as AccessTokenPayload;
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'refresh' }, REFRESH_SECRET, { expiresIn: '7d' });
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, REFRESH_SECRET) as { sub: string };
}

// Short-lived, single-purpose token issued between "password verified" and
// "MFA verified" — deliberately structured differently from AccessTokenPayload
// (no role/institutionId) so it can never be mistaken for a full access token
// by the `authenticate` middleware.
const MFA_SECRET = process.env.JWT_MFA_SECRET || 'zacc-dev-mfa-secret-change-in-production';

export function signMfaChallengeToken(userId: string, purpose: 'setup' | 'challenge'): string {
  return jwt.sign({ sub: userId, purpose, mfaStage: true }, MFA_SECRET, { expiresIn: '5m' });
}

export function verifyMfaChallengeToken(token: string): { sub: string; purpose: 'setup' | 'challenge' } {
  const decoded = jwt.verify(token, MFA_SECRET) as { sub: string; purpose: 'setup' | 'challenge'; mfaStage: boolean };
  if (!decoded.mfaStage) throw new Error('Not an MFA token');
  return decoded;
}
