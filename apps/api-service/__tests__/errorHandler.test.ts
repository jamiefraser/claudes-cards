/**
 * Error Handler Tests — Unit 3
 */

import { Request, Response, NextFunction } from 'express';
import { errorHandler, AppError } from '../src/middleware/errorHandler';

function mockResponse() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { status, json, res: { status } as unknown as Partial<Response> };
}

const next: NextFunction = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('errorHandler middleware', () => {
  it('returns 500 for an unhandled Error', () => {
    const err = new Error('Something went wrong') as AppError;
    const req = { path: '/test', method: 'GET' } as Request;
    const { status, json, res } = mockResponse();

    errorHandler(err, req, res as Response, next);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Internal server error' }),
    );
  });

  it('returns custom statusCode when provided on the error', () => {
    const err = new Error('Not found') as AppError;
    err.statusCode = 404;
    const req = { path: '/missing', method: 'GET' } as Request;
    const { status, json, res } = mockResponse();

    errorHandler(err, req, res as Response, next);

    expect(status).toHaveBeenCalledWith(404);
    // 4xx errors expose the actual message
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Not found' }),
    );
  });

  it('returns 400 for a validation error', () => {
    const err = new Error('Bad input') as AppError;
    err.statusCode = 400;
    const req = { path: '/api/v1/dev/token', method: 'POST' } as Request;
    const { status, res } = mockResponse();

    errorHandler(err, req, res as Response, next);

    expect(status).toHaveBeenCalledWith(400);
  });
});
