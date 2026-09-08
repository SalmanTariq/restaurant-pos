import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.enableCors({
    origin: [
      'http://localhost:1420',
      'http://tauri.localhost',
      'https://tauri.localhost',
      'tauri://localhost',
    ],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
    exposedHeaders: ['set-auth-token'],
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
