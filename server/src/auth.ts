import type { NextFunction, Request, Response } from 'express';

/** Bearer-token auth middleware (ADR-0009). Single static token, no rotation. */
export function bearerAuth(token: string) {
  const expected = `Bearer ${token}`;
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.header('Authorization') !== expected) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    next();
  };
}
