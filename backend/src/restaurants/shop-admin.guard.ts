import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import type { AuthSession } from '../auth/auth.guard';

@Injectable()
export class ShopAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<
      Request & { session?: AuthSession }
    >();
    const user = request.session?.user;
    if (user?.role !== 'admin' || !user.restaurantId) {
      throw new ForbiddenException('Restaurant admin access only.');
    }
    return true;
  }
}
