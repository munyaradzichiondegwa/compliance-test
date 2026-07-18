import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  // eslint-disable-next-line no-console
  console.error(`[ERROR] ${req.method} ${req.path}:`, err?.message || err);
  if (res.headersSent) return;
  const status = err?.status || 500;
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
