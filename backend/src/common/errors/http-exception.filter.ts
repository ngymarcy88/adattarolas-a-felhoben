import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import type { RequestWithId } from '../middleware/request-id.middleware';
import { ApiError } from './api-error';

const safeErrors: Record<number, { code: string; message: string }> = {
  400: { code: 'INVALID_REQUEST', message: 'A kérés formátuma hibás.' },
  401: { code: 'AUTH_REQUIRED', message: 'A művelethez bejelentkezés szükséges.' },
  403: { code: 'FORBIDDEN', message: 'A művelet nem engedélyezett.' },
  404: { code: 'RESOURCE_NOT_FOUND', message: 'A keresett erőforrás nem található.' },
  405: { code: 'METHOD_NOT_ALLOWED', message: 'Ez a kérési mód nem engedélyezett.' },
  409: { code: 'RESOURCE_STATE_CONFLICT', message: 'A művelet a jelenlegi állapotban nem végezhető el.' },
  413: { code: 'REQUEST_TOO_LARGE', message: 'A kérés mérete túl nagy.' },
  415: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'A kérés tartalomtípusa nem támogatott.' },
  429: { code: 'RATE_LIMITED', message: 'Túl sok kérés érkezett. Próbáld újra később.' },
  503: { code: 'SERVICE_UNAVAILABLE', message: 'A szolgáltatás átmenetileg nem érhető el.' },
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();
    const requestId = request.requestId ?? randomUUID();
    const bodyParserError = exception instanceof Error && 'type' in exception
      ? exception.type : undefined;
    const status = exception instanceof HttpException ? exception.getStatus()
      : bodyParserError === 'entity.parse.failed' ? 400
      : bodyParserError === 'entity.too.large' ? 413
      : bodyParserError === 'charset.unsupported' || bodyParserError === 'encoding.unsupported' ? 415
      : 500;
    const fallback = { code: 'INTERNAL_ERROR', message: 'Váratlan hiba történt. Próbáld újra később.' };
    const safe = exception instanceof ApiError
      ? { code: exception.code, message: exception.message }
      : safeErrors[status] ?? fallback;
    if (status >= 500) {
      this.logger.error({ event: 'http_request_failed', requestId, status, code: safe.code });
    }
    response.setHeader('X-Request-Id', requestId);
    response.status(status).json({ error: { ...safe, details: {}, requestId } });
  }
}
