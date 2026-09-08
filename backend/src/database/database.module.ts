import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { POS_ENTITIES } from './entities';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => {
        const databasePath =
          process.env.DATABASE_PATH ??
          join(process.cwd(), 'data', 'pos.sqlite');

        mkdirSync(dirname(databasePath), { recursive: true });

        return {
          type: 'better-sqlite3' as const,
          database: databasePath,
          entities: POS_ENTITIES,
          autoLoadEntities: true,
          synchronize: true,
          logging: false,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
