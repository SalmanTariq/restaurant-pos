const root = require('node:path').resolve(__dirname, '../../backend');
require(root + '/node_modules/ts-node').register({ transpileOnly: true, project: root + '/tsconfig.json' });
const assert = require('node:assert/strict');
const mysql = require(root + '/node_modules/mysql2/promise');
const { DataSource } = require(root + '/node_modules/typeorm');
const { posTypeOrmOptions } = require(root + '/src/database/data-source');
const { Restaurant } = require(root + '/src/database/entities/restaurant.entity');
const { Order } = require(root + '/src/database/entities/order.entity');
const { MenuItem } = require(root + '/src/database/entities/menu-item.entity');
const { applyTillChanges } = require(root + '/src/till/till-incremental');
const { AddOrderTokenDay1730000000004 } = require(root + '/src/database/migrations/1730000000004-add-order-token-day');
(async () => {
  const db = 'pos_sync_regression_' + process.pid;
  const admin = await mysql.createConnection({ host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_TEST_ADMIN_USER || 'root', password: process.env.MYSQL_TEST_ADMIN_PASSWORD || 'pos', connectTimeout: 3000 });
  let ds;
  try {
    await admin.query('CREATE DATABASE `' + db + '`');
    ds = new DataSource({ ...posTypeOrmOptions(), host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT || 3306), username: process.env.MYSQL_TEST_ADMIN_USER || 'root', password: process.env.MYSQL_TEST_ADMIN_PASSWORD || 'pos', database: db, synchronize: true, migrationsRun: false });
    await ds.initialize();
    const restaurant = await ds.getRepository(Restaurant).save({ name: 'Sync regression', nextToken: 1 });
    const wire = { id: 'ord-1791058750980-test', token: 1, type: 'takeaway', tableId: null, date: '2026-10-04', time: '1:19 AM', status: 'paid', payment: 'cash', paidAt: '2026-10-03T20:19:10.000Z', lines: [{ id: 'roti', name: 'Roti', price: 25, qty: 2 }] };
    const sync = changes => ds.transaction(async em => {
      const locked = await em.findOne(Restaurant, { where: { id: restaurant.id }, lock: { mode: 'pessimistic_write' } });
      return applyTillChanges(em, locked, { changes });
    });
    const insert = { collection: 'orders', key: wire.id, before: null, after: wire };
    await sync([insert]);
    const original = await ds.getRepository(Order).findOneByOrFail({ restaurantId: restaurant.id, clientId: wire.id });
    await sync([insert]);
    const edited = { ...wire, payment: 'online' };
    await sync([{ ...insert, before: wire, after: edited }]);
    const persisted = await ds.getRepository(Order).findOneOrFail({ where: { id: original.id }, relations: ['items'] });
    assert.equal(persisted.createdAt.getTime(), original.createdAt.getTime());
    assert.equal(persisted.paidAt.getTime(), original.paidAt.getTime());
    assert.equal(persisted.items.length, 1);
    const menu = { id: 'roti', name: 'Roti', nameUrdu: '', category: 'Bread', price: 25, stock: 10, active: true, imageDataUrl: null };
    await assert.rejects(sync([
      { collection: 'menu', key: 'roti', before: null, after: menu },
      { ...insert, before: wire, after: { ...wire, time: '2:00 AM' } },
    ]), /Another till changed/);
    assert.equal(await ds.getRepository(MenuItem).count(), 0, 'Earlier writes in a conflicting batch must roll back');
    await sync([{ collection: 'menu', key: menu.id, before: null, after: menu }]);
    const concurrent = await Promise.allSettled([
      sync([{ collection: 'menu', key: menu.id, before: menu, after: { ...menu, stock: 11 } }]),
      sync([{ collection: 'menu', key: menu.id, before: menu, after: { ...menu, stock: 12 } }]),
    ]);
    assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(concurrent.filter(result => result.status === 'rejected').length, 1);

    await sync([{ ...insert, before: edited, after: { ...edited, lines: [{ ...wire.lines[0], qty: 3 }] } }]);
    const changed = await ds.getRepository(Order).findOneOrFail({ where: { id: original.id }, relations: ['items'] });
    assert.equal(changed.items.length, 1); assert.equal(changed.items[0].quantity, 3);
    await sync([{ ...insert, before: { ...edited, lines: [{ ...wire.lines[0], qty: 3 }] }, after: null }]);
    assert.equal(await ds.getRepository(Order).count(), 0);
    // Exercise the production migration from calendar-day uniqueness with a
    // real retained historical order, rather than only a synchronized schema.
    const runner = ds.createQueryRunner();
    await runner.connect();
    try {
      const table = await runner.getTable('orders');
      const dailyIndex = table.indices.find(index => index.columnNames.includes('tokenDay'));
      await runner.dropIndex('orders', dailyIndex);
      await runner.dropColumn('orders', 'tokenDay');
      await runner.query('ALTER TABLE `orders` ADD UNIQUE INDEX `legacy_calendar_token` (`restaurantId`, `businessDate`, `tokenNumber`)');
      await runner.query('INSERT INTO `orders` (`restaurantId`, `clientId`, `tokenNumber`, `businessDate`, `type`, `clockTime`, `status`, `total`) VALUES (?, ?, 1, ?, ?, ?, ?, 50)',
        [restaurant.id, 'legacy-overnight', '2026-10-06', 'takeaway', '1:00 AM', 'paid']);
      const [beforeMigration] = await runner.query('SELECT * FROM `orders` WHERE `clientId` = ?', ['legacy-overnight']);
      await new AddOrderTokenDay1730000000004().up(runner);
      const [afterMigration] = await runner.query('SELECT * FROM `orders` WHERE `clientId` = ?', ['legacy-overnight']);
      const { tokenDay, ...retained } = afterMigration;
      assert.equal(tokenDay, null);
      assert.deepEqual(retained, beforeMigration, 'Migration must retain every historical order field');
      // Migration is safe to retry after an interrupted deployment.
      await new AddOrderTokenDay1730000000004().up(runner);
      const morning = { ...wire, id: 'new-business-day', date: '2026-10-06', time: '10:00 AM' };
      await sync([{ collection: 'orders', key: morning.id, before: null, after: morning }]);
      const nextOvernight = { ...wire, id: 'next-overnight', date: '2026-10-07', time: '1:00 AM' };
      await assert.rejects(sync([{ collection: 'orders', key: nextOvernight.id, before: null, after: nextOvernight }]), /Token 1 was used/);
      assert.equal(await ds.getRepository(Order).count(), 2);
    } finally {
      await runner.release();
    }
    console.log('Live MySQL regression passed: sync, conflict rollback, business-day tokens, and migration preserving historical orders.');
  } finally {
    if (ds?.isInitialized) await ds.destroy();
    try { await admin.query('DROP DATABASE IF EXISTS `' + db + '`'); } finally { await admin.end(); }
  }
})().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
