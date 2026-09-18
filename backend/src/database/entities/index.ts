import { Restaurant } from './restaurant.entity';
import { DiningTable } from './dining-table.entity';
import { Expense } from './expense.entity';
import { MenuItem } from './menu-item.entity';
import { Order, OrderItem } from './order.entity';
import { WageStaff } from './wage-staff.entity';
import { BusinessDay } from './business-day.entity';

export const POS_ENTITIES = [
  Restaurant,
  MenuItem,
  DiningTable,
  Order,
  OrderItem,
  Expense,
  WageStaff,
  BusinessDay,
];

export { Restaurant } from './restaurant.entity';
export { DiningTable, Expense, MenuItem, Order, OrderItem, WageStaff, BusinessDay };
export { OrderStatus, OrderType, PaymentMethod } from './enums';
