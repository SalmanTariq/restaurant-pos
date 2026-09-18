import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import type { AuthSession } from '../auth/auth.guard';

@Injectable()
export class PlatformGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<
      Request & { session?: AuthSession }
    >();
    if (request.session?.user?.role !== 'platform') {
      throw new ForbiddenException('Platform access only.');
    }
    return true;
  }
}
