import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PlatformGuard } from './platform.guard';
import {
  RestaurantsService,
  type CreateRestaurantInput,
} from './restaurants.service';
import type { RestaurantStatus } from '../database/entities/restaurant.entity';

@Controller('platform/restaurants')
@UseGuards(PlatformGuard)
export class PlatformRestaurantsController {
  constructor(private readonly restaurants: RestaurantsService) {}

  @Get()
  list() {
    return this.restaurants.list();
  }

  @Post()
  create(@Body() body: CreateRestaurantInput) {
    return this.restaurants.create(body);
  }

  @Patch(':id')
  setStatus(
    @Param('id') id: string,
    @Body() body: { status?: RestaurantStatus },
  ) {
    return this.restaurants.setStatus(id, body.status as RestaurantStatus);
  }

  @Post(':id/password')
  @HttpCode(200)
  resetPassword(
    @Param('id') id: string,
    @Body() body: { password?: string },
  ) {
    return this.restaurants.resetOwnerPassword(id, body.password ?? '');
  }

  @Post(':id/clear-sales')
  @HttpCode(200)
  clearSales(@Param('id') id: string) {
    return this.restaurants.clearSales(id);
  }
}
