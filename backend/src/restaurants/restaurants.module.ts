import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Restaurant } from '../database/entities/restaurant.entity';
import { PlatformRestaurantsController } from './platform-restaurants.controller';
import { RestaurantsService } from './restaurants.service';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

@Module({
  imports: [TypeOrmModule.forFeature([Restaurant])],
  controllers: [PlatformRestaurantsController, StaffController],
  providers: [RestaurantsService, StaffService],
})
export class RestaurantsModule {}
