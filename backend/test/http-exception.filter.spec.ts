import { ArgumentsHost, BadRequestException, HttpException, Logger, NotFoundException } from '@nestjs/common';
import { ApiError } from '../src/common/errors/api-error';
import { HttpExceptionFilter } from '../src/common/errors/http-exception.filter';

function context(requestId?: string) {
  const response = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
  const host = { switchToHttp: () => ({ getRequest: () => ({ requestId }), getResponse: () => response }) };
  return { response, host: host as unknown as ArgumentsHost };
}

describe('HttpExceptionFilter', () => {
  it('redacts unknown errors in response and logs', () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { response, host } = context('test_123');
    new HttpExceptionFilter().catch(new Error('postgresql://user:secret@private/db token=secret'), host);
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({ error: {
      code: 'INTERNAL_ERROR', message: 'Váratlan hiba történt. Próbáld újra később.',
      details: {}, requestId: 'test_123',
    } });
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
    log.mockRestore();
  });

  it.each([
    [new BadRequestException({ message: 'password=secret', details: { token: 'secret' } }), 400, 'INVALID_REQUEST'],
    [new NotFoundException('private/path?token=secret'), 404, 'RESOURCE_NOT_FOUND'],
    [new HttpException('provider=secret', 503), 503, 'SERVICE_UNAVAILABLE'],
    [new ApiError('ORIGIN_NOT_ALLOWED'), 403, 'ORIGIN_NOT_ALLOWED'],
    [Object.assign(new SyntaxError('secret malformed body'), { type: 'entity.parse.failed' }), 400, 'INVALID_REQUEST'],
    [Object.assign(new Error('secret oversized body'), { type: 'entity.too.large' }), 413, 'REQUEST_TOO_LARGE'],
    [Object.assign(new Error('secret unsupported charset'), { type: 'charset.unsupported', status: 415 }), 415, 'UNSUPPORTED_MEDIA_TYPE'],
    [Object.assign(new Error('secret unsupported encoding'), { type: 'encoding.unsupported', status: 415 }), 415, 'UNSUPPORTED_MEDIA_TYPE'],
  ])('maps known HTTP errors with safe code %#', (exception, status, code) => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { response, host } = context('test_123');
    new HttpExceptionFilter().catch(exception, host);
    expect(response.status).toHaveBeenCalledWith(status);
    expect(response.json).toHaveBeenCalledWith({ error: expect.objectContaining({ code, details: {}, requestId: 'test_123' }) });
    expect(JSON.stringify(response.json.mock.calls)).not.toContain('secret');
    expect(response.setHeader).toHaveBeenCalledWith('X-Request-Id', 'test_123');
    if (status < 500) expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('provides a fallback request ID when middleware has not run', () => {
    const { response, host } = context();
    new HttpExceptionFilter().catch(new NotFoundException(), host);
    expect(response.setHeader).toHaveBeenCalledWith('X-Request-Id', expect.stringMatching(/^[a-f0-9-]{36}$/));
  });
});
