import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { TillModule } from './till/till.module';

@Module({
  imports: [DatabaseModule, AuthModule, RestaurantsModule, TillModule],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
