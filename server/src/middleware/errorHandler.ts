import { Request, Response, NextFunction } from 'express';

// Fields that must never be printed to the server console even in error logs.
const REDACT_KEYS = new Set(['password', 'currentPassword', 'newPassword', 'token', 'accessToken', 'refreshToken', 'signatureText']);

function redactedBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const clone: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  for (const key of Object.keys(clone)) {
    if (REDACT_KEYS.has(key)) clone[key] = '[redacted]';
  }
  return clone;
}

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const status = err?.status || 500;
  // eslint-disable-next-line no-console
  console.error(
    `\n[ERROR] ${new Date().toISOString()} ${req.method} ${req.path} → ${status}\n` +
      `  message: ${err?.message || err}\n` +
      `  body:    ${JSON.stringify(redactedBody(req.body))}\n` +
      (err?.code ? `  code:    ${err.code}\n` : '') + // e.g. SQLITE_CONSTRAINT, SQLITE_ERROR
      (err?.stack ? `  stack:\n${err.stack}\n` : '')
  );
  if (res.headersSent) return;
  res.status(status).json({ error: err?.message || 'Internal server error' });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
}

/** Wraps an async route handler so rejected promises are forwarded to errorHandler. */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
