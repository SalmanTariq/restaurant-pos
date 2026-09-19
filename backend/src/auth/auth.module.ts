import {
  MiddlewareConsumer,
  Module,
  NestModule,
  OnModuleDestroy,
  OnModuleInit,
  RequestMethod,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AuthGuard } from './auth.guard';
import { closeAuth, runAuthMigrations } from './auth';
import { BetterAuthMiddleware } from './better-auth.middleware';
import { MeController } from './me.controller';

@Module({
  controllers: [MeController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AuthModule implements NestModule, OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await runAuthMigrations();
  }

  async onModuleDestroy() {
    await closeAuth();
  }

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(BetterAuthMiddleware).forRoutes('*');

    consumer
      .apply(json({ limit: '12mb' }), urlencoded({ extended: true, limit: '12mb' }))
      .exclude({ path: 'api/auth/(.*)', method: RequestMethod.ALL })
      .forRoutes('*');
  }
}
