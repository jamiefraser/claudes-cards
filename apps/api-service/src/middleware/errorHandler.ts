/**
 * Global Express Error Handler
 *
 * Catches errors passed via next(err) and returns appropriate HTTP responses.
 * Must be registered as the last middleware in the Express app.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const statusCode = err.statusCode ?? 500;
  const message = statusCode < 500 ? err.message : 'Internal server error';

  logger.error('Unhandled error', {
    statusCode,
    message: err.message,
    code: err.code,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { detail: err.message }),
  });
}
