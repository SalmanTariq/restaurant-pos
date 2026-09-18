import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessDay } from '../database/entities/business-day.entity';
import { DiningTable } from '../database/entities/dining-table.entity';
import { Expense } from '../database/entities/expense.entity';
import { MenuItem } from '../database/entities/menu-item.entity';
import { Order, OrderItem } from '../database/entities/order.entity';
import { Restaurant } from '../database/entities/restaurant.entity';
import { WageStaff } from '../database/entities/wage-staff.entity';
import { TillController } from './till.controller';
import { TillService } from './till.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Restaurant,
      MenuItem,
      Order,
      OrderItem,
      Expense,
      WageStaff,
      BusinessDay,
      DiningTable,
    ]),
  ],
  controllers: [TillController],
  providers: [TillService],
})
export class TillModule {}
