import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createConnection } from 'mysql2/promise';
import { POS_ENTITIES } from './entities';
import { mysqlEnv } from './mysql-env';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: async () => {
        const mysql = mysqlEnv();
        const bootstrap = await createConnection({
          host: mysql.host,
          port: mysql.port,
          user: mysql.user,
          password: mysql.password,
        });
        try {
          await bootstrap.query(
            `CREATE DATABASE IF NOT EXISTS \`${mysql.database}\``,
          );
        } catch {
          // pos user may lack CREATE privilege; database must already exist
        } finally {
          await bootstrap.end();
        }

        const isTestDb =
          process.env.NODE_ENV === 'test' && mysql.database.includes('test');

        return {
          type: 'mysql' as const,
          host: mysql.host,
          port: mysql.port,
          username: mysql.user,
          password: mysql.password,
          database: mysql.database,
          entities: POS_ENTITIES,
          autoLoadEntities: true,
          synchronize: true,
          dropSchema: isTestDb,
          logging: false,
          charset: 'utf8mb4',
          dateStrings: true,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
