import { DataSource } from 'typeorm';
import { POS_ENTITIES } from './entities';
import { EnsurePosSchema1730000000000 } from './migrations/1730000000000-ensure-pos-schema';
import { AddMissingTillColumns1730000000001 } from './migrations/1730000000001-add-missing-till-columns';
import { AddBusinessDayClosedAt1730000000002 } from './migrations/1730000000002-add-business-day-closed-at';
import { AddRestaurantUseTables1730000000003 } from './migrations/1730000000003-add-restaurant-use-tables';
import { mysqlEnv } from './mysql-env';

export const POS_MIGRATIONS = [
  EnsurePosSchema1730000000000,
  AddMissingTillColumns1730000000001,
  AddBusinessDayClosedAt1730000000002,
  AddRestaurantUseTables1730000000003,
];

export function posTypeOrmOptions() {
  const mysql = mysqlEnv();
  return {
    type: 'mysql' as const,
    host: mysql.host,
    port: mysql.port,
    username: mysql.user,
    password: mysql.password,
    database: mysql.database,
    entities: POS_ENTITIES,
    migrations: POS_MIGRATIONS,
    charset: 'utf8mb4',
    dateStrings: true as const,
    logging: false as const,
  };
}

export default new DataSource({
  ...posTypeOrmOptions(),
  synchronize: false,
  migrationsRun: false,
});
