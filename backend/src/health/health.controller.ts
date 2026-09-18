import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Public } from '../auth/public.decorator';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  async check() {
    const rows = (await this.dataSource.query(
      'SELECT VERSION() AS version',
    )) as Array<{ version: string }>;

    return {
      status: 'ok',
      database: 'mysql',
      mysqlVersion: rows[0]?.version,
    };
  }
}
