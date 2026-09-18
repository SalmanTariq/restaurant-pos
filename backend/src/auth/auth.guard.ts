import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { assertShopAccess, getAuth } from './auth';
import { loadEsm } from './load-esm';
import { IS_PUBLIC_KEY } from './public.decorator';

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role?: string | null;
  restaurantId?: string | null;
};

export type AuthSession = {
  user: SessionUser;
  session: { id: string };
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<
      Request & { session?: AuthSession }
    >();
    const isAuthRoute = request.originalUrl.startsWith('/api/auth');

    const auth = await getAuth();
    const { fromNodeHeaders } = await loadEsm<
      typeof import('better-auth/node')
    >('better-auth/node');
    const session = (await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    })) as AuthSession | null;

    if (isAuthRoute) {
      const isGetSession = request.originalUrl.includes('get-session');
      if (isGetSession && session?.user) {
        try {
          await assertShopAccess(session.user);
        } catch {
          throw new ForbiddenException('This restaurant is disabled.');
        }
      }
      return true;
    }

    if (!session) {
      throw new UnauthorizedException();
    }

    try {
      await assertShopAccess(session.user);
    } catch {
      throw new ForbiddenException('This restaurant is disabled.');
    }

    request.session = session;
    return true;
  }
}
