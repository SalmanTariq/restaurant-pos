import { DiningTable } from './dining-table.entity';
import { Expense } from './expense.entity';
import { MenuItem } from './menu-item.entity';
import { Order, OrderItem } from './order.entity';

export const POS_ENTITIES = [
  MenuItem,
  DiningTable,
  Order,
  OrderItem,
  Expense,
];

export { DiningTable, Expense, MenuItem, Order, OrderItem };
export { OrderStatus, OrderType, PaymentMethod } from './enums';
