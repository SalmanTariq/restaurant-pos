import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddOrderTokenDay1730000000004 implements MigrationInterface {
  name = 'AddOrderTokenDay1730000000004';

  async up(queryRunner: QueryRunner): Promise<void> {
    let table = await queryRunner.getTable('orders');
    if (!table) throw new Error('Orders table is missing.');
    if (!table.findColumnByName('tokenDay')) {
      await queryRunner.addColumn('orders', new TableColumn({ name: 'tokenDay', type: 'date', isNullable: true }));
    }
    // Historical rows retain their dates, tokens and data. Legacy rows are
    // checked by the sync transaction; new/edited rows gain a token-day key.
    for (const index of table.indices) {
      if (index.isUnique && index.columnNames.length === 3 &&
        ['restaurantId', 'businessDate', 'tokenNumber'].every(column => index.columnNames.includes(column))) {
        await queryRunner.dropIndex('orders', index);
      }
    }
    table = (await queryRunner.getTable('orders'))!;
    if (!table.indices.some(index => index.columnNames.join(',') === 'restaurantId,tokenDay,tokenNumber')) {
      await queryRunner.createIndex('orders', new TableIndex({ name: 'IDX_orders_restaurant_token_day',
        columnNames: ['restaurantId', 'tokenDay', 'tokenNumber'], isUnique: true }));
    }
    if (!table.indices.some(index => index.columnNames.join(',') === 'restaurantId,businessDate,tokenNumber')) {
      await queryRunner.createIndex('orders', new TableIndex({ name: 'IDX_orders_restaurant_calendar_token',
        columnNames: ['restaurantId', 'businessDate', 'tokenNumber'] }));
    }
  }

  async down(): Promise<void> {
    // Calendar-day uniqueness cannot be restored after business-day token resets.
    // Retain the live schema and order records.
  }
}
