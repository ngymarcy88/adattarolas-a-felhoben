import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export interface RequestWithId extends Request {
  requestId?: string;
}

export function requestIdMiddleware(req: RequestWithId, res: Response, next: NextFunction): void {
  const candidate = req.headers['x-request-id'];
  req.requestId = typeof candidate === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(candidate)
    ? candidate
    : randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}
