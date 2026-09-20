import { MigrationInterface, QueryRunner } from 'typeorm';

async function hasTable(queryRunner: QueryRunner, name: string) {
  const rows = (await queryRunner.query(`SHOW TABLES LIKE ?`, [name])) as unknown[];
  return rows.length > 0;
}

async function hasColumn(
  queryRunner: QueryRunner,
  table: string,
  column: string,
) {
  const rows = (await queryRunner.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [
    column,
  ])) as unknown[];
  return rows.length > 0;
}

export class EnsurePosSchema1730000000000 implements MigrationInterface {
  name = 'EnsurePosSchema1730000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await hasTable(queryRunner, 'restaurants'))) {
      await queryRunner.query(`
        CREATE TABLE \`restaurants\` (
          \`id\` varchar(36) NOT NULL,
          \`name\` varchar(255) NOT NULL,
          \`status\` varchar(255) NOT NULL DEFAULT 'active',
          \`lastLoginAt\` datetime NULL,
          \`nextToken\` int NOT NULL DEFAULT 1,
          \`logoDataUrl\` longtext NULL,
          \`requirePettyCash\` tinyint NOT NULL DEFAULT 1,
          \`useInventory\` tinyint NOT NULL DEFAULT 1,
          \`floorPlan\` json NULL,
          \`menuCategories\` json NULL,
          \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    }

    if (!(await hasTable(queryRunner, 'menu_items'))) {
      await queryRunner.query(`
        CREATE TABLE \`menu_items\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`restaurantId\` varchar(255) NOT NULL,
          \`clientId\` varchar(255) NOT NULL,
          \`stock\` int NOT NULL DEFAULT 0,
          \`name\` varchar(255) NOT NULL,
          \`nameUrdu\` varchar(255) NULL,
          \`category\` varchar(255) NOT NULL,
          \`salePrice\` decimal(10,2) NOT NULL,
          \`isActive\` tinyint NOT NULL DEFAULT 1,
          \`imageDataUrl\` mediumtext NULL,
          \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`IDX_menu_items_restaurant_client\` (\`restaurantId\`, \`clientId\`),
          KEY \`IDX_menu_items_restaurant_name\` (\`restaurantId\`, \`name\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    } else if (!(await hasColumn(queryRunner, 'menu_items', 'nameUrdu'))) {
      await queryRunner.query(
        `ALTER TABLE \`menu_items\` ADD \`nameUrdu\` varchar(255) NULL`,
      );
    }

    if (!(await hasTable(queryRunner, 'dining_tables'))) {
      await queryRunner.query(`
        CREATE TABLE \`dining_tables\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`restaurantId\` varchar(255) NOT NULL,
          \`tableNumber\` varchar(255) NOT NULL,
          \`isActive\` tinyint NOT NULL DEFAULT 1,
          \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`IDX_dining_tables_restaurant_number\` (\`restaurantId\`, \`tableNumber\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    }

    if (!(await hasTable(queryRunner, 'orders'))) {
      await queryRunner.query(`
        CREATE TABLE \`orders\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`restaurantId\` varchar(255) NOT NULL,
          \`clientId\` varchar(255) NOT NULL,
          \`tokenNumber\` int NOT NULL,
          \`businessDate\` date NOT NULL,
          \`type\` varchar(255) NOT NULL,
          \`diningTableId\` int NULL,
          \`tableNumber\` varchar(255) NULL,
          \`tableId\` varchar(255) NULL,
          \`clockTime\` varchar(255) NOT NULL DEFAULT '',
          \`status\` varchar(255) NOT NULL DEFAULT 'open',
          \`paymentMethod\` varchar(255) NULL,
          \`total\` decimal(10,2) NOT NULL DEFAULT 0,
          \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          \`paidAt\` datetime NULL,
          \`cancelledAt\` datetime NULL,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`IDX_orders_restaurant_date_token\` (\`restaurantId\`, \`businessDate\`, \`tokenNumber\`),
          UNIQUE KEY \`IDX_orders_restaurant_client\` (\`restaurantId\`, \`clientId\`),
          KEY \`FK_orders_dining_table\` (\`diningTableId\`),
          CONSTRAINT \`FK_orders_dining_table\` FOREIGN KEY (\`diningTableId\`) REFERENCES \`dining_tables\`(\`id\`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    }

    if (!(await hasTable(queryRunner, 'order_items'))) {
      await queryRunner.query(`
        CREATE TABLE \`order_items\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`orderId\` int NULL,
          \`menuItemId\` int NULL,
          \`name\` varchar(255) NOT NULL,
          \`clientItemId\` varchar(255) NULL,
          \`quantity\` int NOT NULL,
          \`unitPrice\` decimal(10,2) NOT NULL,
          \`lineTotal\` decimal(10,2) NOT NULL,
          PRIMARY KEY (\`id\`),
          KEY \`FK_order_items_order\` (\`orderId\`),
          KEY \`FK_order_items_menu\` (\`menuItemId\`),
          CONSTRAINT \`FK_order_items_order\` FOREIGN KEY (\`orderId\`) REFERENCES \`orders\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`FK_order_items_menu\` FOREIGN KEY (\`menuItemId\`) REFERENCES \`menu_items\`(\`id\`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    }

    if (!(await hasTable(queryRunner, 'expenses'))) {
      await queryRunner.query(`
        CREATE TABLE \`expenses\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`restaurantId\` varchar(255) NOT NULL,
          \`title\` varchar(255) NOT NULL,
          \`category\` varchar(255) NOT NULL,
          \`amount\` decimal(10,2) NOT NULL,
          \`date\` date NOT NULL,
          \`notes\` text NULL,
          \`clientId\` varchar(255) NOT NULL,
          \`staffId\` varchar(255) NULL,
          \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`IDX_expenses_restaurant_client\` (\`restaurantId\`, \`clientId\`),
          KEY \`IDX_expenses_restaurant_date\` (\`restaurantId\`, \`date\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    }

    if (!(await hasTable(queryRunner, 'wage_staff'))) {
      await queryRunner.query(`
        CREATE TABLE \`wage_staff\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`restaurantId\` varchar(255) NOT NULL,
          \`clientId\` varchar(255) NOT NULL,
          \`name\` varchar(255) NOT NULL,
          \`dailyWage\` decimal(10,2) NOT NULL,
          \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`IDX_wage_staff_restaurant_client\` (\`restaurantId\`, \`clientId\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    }

    if (!(await hasTable(queryRunner, 'business_days'))) {
      await queryRunner.query(`
        CREATE TABLE \`business_days\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`restaurantId\` varchar(255) NOT NULL,
          \`date\` date NOT NULL,
          \`openedAt\` datetime NOT NULL,
          \`pettyCash\` decimal(10,2) NOT NULL DEFAULT 0,
          \`openedBy\` varchar(255) NOT NULL,
          \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`IDX_business_days_restaurant_date\` (\`restaurantId\`, \`date\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    }
  }

  public async down(): Promise<void> {
    // Production schema is not dropped from here.
  }
}
