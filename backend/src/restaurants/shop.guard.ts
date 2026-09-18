import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import type { AuthSession } from '../auth/auth.guard';

@Injectable()
export class ShopGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<
      Request & { session?: AuthSession }
    >();
    const user = request.session?.user;
    const shopRole = user?.role === 'admin' || user?.role === 'cashier';
    if (!shopRole || !user.restaurantId) {
      throw new ForbiddenException('Restaurant access only.');
    }
    return true;
  }
}
