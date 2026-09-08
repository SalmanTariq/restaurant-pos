import { Controller, Get } from '@nestjs/common';
import { Session } from './session.decorator';

@Controller()
export class MeController {
  @Get('me')
  me(
    @Session()
    session: {
      user: { email: string; name: string };
    },
  ) {
    return { user: session.user };
  }
}
