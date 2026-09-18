import { Controller, Get } from '@nestjs/common';
import { Session } from './session.decorator';
import type { AuthSession } from './auth.guard';

@Controller()
export class MeController {
  @Get('me')
  me(@Session() session: AuthSession) {
    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: session.user.role ?? null,
        restaurantId: session.user.restaurantId ?? null,
      },
    };
  }
}
