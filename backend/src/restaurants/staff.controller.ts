import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Session } from '../auth/session.decorator';
import type { AuthSession } from '../auth/auth.guard';
import { ShopAdminGuard } from './shop-admin.guard';
import { StaffService } from './staff.service';

@Controller('staff')
@UseGuards(ShopAdminGuard)
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  async list(@Session() session: AuthSession) {
    const users = await this.staff.list(session.user.restaurantId as string);
    return { users };
  }

  @Post()
  create(
    @Session() session: AuthSession,
    @Body()
    body: {
      name: string;
      email: string;
      password: string;
      role?: string;
    },
  ) {
    return this.staff.create(session.user.restaurantId as string, body);
  }
}
