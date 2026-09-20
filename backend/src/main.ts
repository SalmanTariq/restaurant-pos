import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { httpOrigins } from './http-origins';
import { ApiExceptionFilter } from './http-error';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.useGlobalFilters(new ApiExceptionFilter());
  if (process.env.TRUST_PROXY === '1') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }
  app.enableCors({
    origin: httpOrigins(),
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
    exposedHeaders: ['set-auth-token'],
  });
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.LISTEN_HOST ?? '0.0.0.0';
  await app.listen(port, host);
}
bootstrap();
