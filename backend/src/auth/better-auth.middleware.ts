import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { getAuth } from './auth';
import { loadEsm } from './load-esm';

@Injectable()
export class BetterAuthMiddleware implements NestMiddleware {
  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!req.originalUrl.startsWith('/api/auth')) {
      next();
      return;
    }

    const auth = await getAuth();
    const { toNodeHandler } = await loadEsm<typeof import('better-auth/node')>(
      'better-auth/node',
    );
    await toNodeHandler(auth)(req, res);
  }
}
