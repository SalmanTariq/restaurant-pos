import { MigrationInterface, QueryRunner } from 'typeorm';

async function hasColumn(
  queryRunner: QueryRunner,
  table: string,
  column: string,
) {
  const rows = (await queryRunner.query(
    `SELECT 1 AS ok
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [table, column],
  )) as unknown[];
  return rows.length > 0;
}

async function addColumn(
  queryRunner: QueryRunner,
  table: string,
  column: string,
  ddl: string,
) {
  if (!(await hasColumn(queryRunner, table, column))) {
    await queryRunner.query(
      `ALTER TABLE \`${table}\` ADD \`${column}\` ${ddl}`,
    );
  }
}

export class AddMissingTillColumns1730000000001 implements MigrationInterface {
  name = 'AddMissingTillColumns1730000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await addColumn(
      queryRunner,
      'menu_items',
      'nameUrdu',
      'varchar(255) NULL',
    );
    await addColumn(queryRunner, 'restaurants', 'menuCategories', 'json NULL');
    await addColumn(queryRunner, 'restaurants', 'floorPlan', 'json NULL');
    await addColumn(queryRunner, 'orders', 'tableId', 'varchar(255) NULL');
    await addColumn(
      queryRunner,
      'order_items',
      'clientItemId',
      'varchar(255) NULL',
    );
    await addColumn(queryRunner, 'expenses', 'staffId', 'varchar(255) NULL');
  }

  public async down(): Promise<void> {
    // Keep live shop columns.
  }
}
