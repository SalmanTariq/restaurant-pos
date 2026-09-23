import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBusinessDayClosedAt1730000000002 implements MigrationInterface {
  name = 'AddBusinessDayClosedAt1730000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT 1 AS ok
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'business_days'
         AND COLUMN_NAME = 'closedAt'
       LIMIT 1`,
    )) as unknown[];
    if (rows.length === 0) {
      await queryRunner.query(
        'ALTER TABLE `business_days` ADD `closedAt` datetime NULL',
      );
    }
  }

  public async down(): Promise<void> {
    // Keep live shop columns.
  }
}
