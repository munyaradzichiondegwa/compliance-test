import { authenticator } from 'otplib';
import QRCode from 'qrcode';

// Real, working TOTP MFA (PRD 19.1: "TOTP-based ... mandatory for all ZACC
// staff accounts"). Compatible with Google Authenticator, Authy, etc.

authenticator.options = { window: 1 }; // allow 1 step of clock drift

export function generateMfaSecret(): string {
  return authenticator.generateSecret();
}

export function buildOtpAuthUrl(email: string, secret: string): string {
  return authenticator.keyuri(email, 'ZACC Compliance Portal', secret);
}

export async function generateQrCodeDataUrl(otpAuthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpAuthUrl);
}

export function verifyMfaToken(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}
