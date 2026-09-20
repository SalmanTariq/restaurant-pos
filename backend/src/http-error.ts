import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

export function publicErrorMessage(error: unknown) {
  if (error instanceof HttpException) {
    const body = error.getResponse();
    if (typeof body === 'string' && body.trim()) return body;
    if (body && typeof body === 'object') {
      const message = (body as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) return message;
      if (Array.isArray(message)) return message.map(String).join(' ');
    }
  }
  if (error && typeof error === 'object') {
    const row = error as {
      sqlMessage?: unknown;
      driverError?: { sqlMessage?: unknown; message?: unknown };
      message?: unknown;
    };
    if (typeof row.sqlMessage === 'string' && row.sqlMessage.trim()) {
      return row.sqlMessage;
    }
    if (
      typeof row.driverError?.sqlMessage === 'string' &&
      row.driverError.sqlMessage.trim()
    ) {
      return row.driverError.sqlMessage;
    }
    if (typeof row.message === 'string' && row.message.trim()) {
      return row.message.replace(/^QueryFailedError:\s*/i, '');
    }
  }
  return 'Internal server error';
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly log = new Logger(ApiExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException) {
      const status = error.getStatus();
      const body = error.getResponse();
      if (typeof body === 'object' && body) {
        response.status(status).json(body);
        return;
      }
      response.status(status).json({
        statusCode: status,
        message: publicErrorMessage(error),
      });
      return;
    }

    this.log.error(error instanceof Error ? error.stack : error);
    const message = publicErrorMessage(error);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message,
    });
  }
}
