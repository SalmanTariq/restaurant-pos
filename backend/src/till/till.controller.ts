import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import type { AuthSession } from '../auth/auth.guard';
import { Session } from '../auth/session.decorator';
import { ShopGuard } from '../restaurants/shop.guard';
import { TillService, type TillSnapshot } from './till.service';

@Controller('till')
@UseGuards(ShopGuard)
export class TillController {
  constructor(private readonly till: TillService) {}

  @Get()
  get(@Session() session: AuthSession) {
    return this.till.get(session.user.restaurantId as string);
  }

  @Put()
  save(@Session() session: AuthSession, @Body() body: Partial<TillSnapshot>) {
    return this.till.save(session.user.restaurantId as string, body);
  }
}
