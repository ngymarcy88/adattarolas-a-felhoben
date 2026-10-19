import type { NextFunction, Response } from 'express';
import { requestIdMiddleware, RequestWithId } from '../src/common/middleware/request-id.middleware';

describe('requestIdMiddleware', () => {
  it.each(['valid_ID-123', 'a'.repeat(64)])('accepts a safe bounded client ID', (value) => {
    const request = { headers: { 'x-request-id': value } } as unknown as RequestWithId;
    const response = { setHeader: jest.fn() };
    const next = jest.fn();
    requestIdMiddleware(request, response as unknown as Response, next as NextFunction);
    expect(request.requestId).toBe(value);
    expect(response.setHeader).toHaveBeenCalledWith('X-Request-Id', value);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, '', 'a'.repeat(65), 'bad\r\nheader', 'token=private', ['first', 'second']])(
    'replaces invalid input %# with a generated ID', (value) => {
      const request = { headers: { 'x-request-id': value } } as unknown as RequestWithId;
      const response = { setHeader: jest.fn() };
      requestIdMiddleware(request, response as unknown as Response, jest.fn());
      expect(request.requestId).toMatch(/^[a-f0-9-]{36}$/);
      expect(request.requestId).not.toBe(value);
    },
  );
});
