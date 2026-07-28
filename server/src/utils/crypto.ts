import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DATA_DIR } from '../db';

// ============================================================================
// Whistleblower Reporting encryption (PRD Section 10.1, 19, 20.3)
//
// Reports are encrypted CLIENT-SIDE in the reporter's browser using the Web
// Crypto API before anything is transmitted:
//   1. Browser generates a random AES-256-GCM content key.
//   2. Report text is encrypted with that key (IV recorded alongside).
//   3. The AES key itself is encrypted ("wrapped") with the Investigations
//      Team's RSA-OAEP public key, fetched from GET /api/v1/whistleblower/public-key.
//   4. Only ciphertext + wrapped key + IV ever reach the server; the server
//      cannot read a report's content unless an authorised
//      INVESTIGATIONS_OFFICER explicitly opens it (which decrypts using the
//      RSA private key held server-side, and is itself logged to
//      whistleblower_access_log per report — see routes/whistleblower.routes.ts).
//
// Honesty note for the deployment team: this gives strong encryption-in-
// transit-and-at-rest with tightly scoped decryption authority — the same
// model used by most enterprise whistleblower platforms. It is not
// zero-knowledge against a fully compromised server (the private key lives
// on this server's disk). Hardening the key custody further (e.g. splitting
// the private key across multiple Commissioners with threshold cryptography,
// or moving it into an HSM/Vault) is recommended before production use with
// real reporters and is flagged in the README.
// ============================================================================

const KEY_DIR = path.join(DATA_DIR, 'keys');
const PRIVATE_KEY_PATH = path.join(KEY_DIR, 'wb_private.pem');
const PUBLIC_KEY_PATH = path.join(KEY_DIR, 'wb_public.pem');

function ensureKeyPair() {
  if (fs.existsSync(PRIVATE_KEY_PATH) && fs.existsSync(PUBLIC_KEY_PATH)) return;
  if (!fs.existsSync(KEY_DIR)) fs.mkdirSync(KEY_DIR, { recursive: true });
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  fs.writeFileSync(PRIVATE_KEY_PATH, privateKey, { mode: 0o600 });
  fs.writeFileSync(PUBLIC_KEY_PATH, publicKey, { mode: 0o644 });
}

export function getWhistleblowerPublicKeyPem(): string {
  ensureKeyPair();
  return fs.readFileSync(PUBLIC_KEY_PATH, 'utf-8');
}

function getPrivateKey(): string {
  ensureKeyPair();
  return fs.readFileSync(PRIVATE_KEY_PATH, 'utf-8');
}

/**
 * Decrypts a report submitted by the browser.
 * encryptedKeyB64: RSA-OAEP(SHA-256)-wrapped AES-256 key, base64.
 * ivB64: 12-byte GCM IV, base64.
 * payloadB64: AES-GCM ciphertext with the 16-byte auth tag appended, base64
 *             (this is the standard output shape of SubtleCrypto.encrypt for AES-GCM).
 */
export function decryptWhistleblowerReport(
  encryptedKeyB64: string,
  ivB64: string,
  payloadB64: string
): string {
  const privateKey = getPrivateKey();
  const wrappedKey = Buffer.from(encryptedKeyB64, 'base64');
  const aesKey = crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    wrappedKey
  );

  const iv = Buffer.from(ivB64, 'base64');
  const full = Buffer.from(payloadB64, 'base64');
  const authTag = full.subarray(full.length - 16);
  const ciphertext = full.subarray(0, full.length - 16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf-8');
}

/**
 * Mirrors the browser's Web Crypto encryption flow (AES-256-GCM content
 * encryption + RSA-OAEP key wrap) so seed.ts can generate demo whistleblower
 * reports that are genuinely decryptable through the same code path a real
 * submission would use. Not used by any live request path — the real flow
 * always encrypts in the browser (see client/src/pages/public/WhistleblowerReport.tsx).
 */
export function encryptForSeed(plaintext: string): { encryptedKey: string; iv: string; payload: string } {
  const publicKey = getWhistleblowerPublicKeyPem();
  const aesKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([ciphertext, authTag]);

  const wrappedKey = crypto.publicEncrypt(
    { key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    aesKey
  );

  return {
    encryptedKey: wrappedKey.toString('base64'),
    iv: iv.toString('base64'),
    payload: payload.toString('base64'),
  };
}

/** Human-friendly, identity-unlinkable tracking code, e.g. WB-7F3K9Q2A */
export function generateTrackingCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
  let code = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return `WB-${code}`;
}
