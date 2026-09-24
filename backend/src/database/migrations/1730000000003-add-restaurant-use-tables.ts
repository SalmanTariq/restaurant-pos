import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRestaurantUseTables1730000000003 implements MigrationInterface {
  name = 'AddRestaurantUseTables1730000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT 1 AS ok
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'restaurants'
         AND COLUMN_NAME = 'useTables'
       LIMIT 1`,
    )) as unknown[];
    if (rows.length === 0) {
      await queryRunner.query(
        'ALTER TABLE `restaurants` ADD `useTables` tinyint NOT NULL DEFAULT 1',
      );
    }
  }

  public async down(): Promise<void> {
    // Keep live shop columns.
  }
}
