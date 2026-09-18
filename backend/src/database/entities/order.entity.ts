import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DiningTable } from './dining-table.entity';
import { OrderStatus, OrderType, PaymentMethod } from './enums';
import { MenuItem } from './menu-item.entity';

@Entity('orders')
@Index(['restaurantId', 'businessDate', 'tokenNumber'], { unique: true })
@Index(['restaurantId', 'clientId'], { unique: true })
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  restaurantId: string;

  @Column()
  clientId: string;

  @Column()
  tokenNumber: number;

  @Column({ type: 'date' })
  businessDate: string;

  @Column({ type: 'varchar' })
  type: OrderType;

  @ManyToOne(() => DiningTable, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'diningTableId' })
  diningTable: DiningTable | null;

  @Column({ type: 'varchar', nullable: true })
  tableNumber: string | null;

  @Column({ type: 'varchar', nullable: true })
  tableId: string | null;

  @Column({ type: 'varchar', default: '' })
  clockTime: string;

  @Column({ type: 'varchar', default: OrderStatus.OPEN })
  status: OrderStatus;

  @Column({ type: 'varchar', nullable: true })
  paymentMethod: PaymentMethod | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  total: string;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items: OrderItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  paidAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  cancelledAt: Date | null;
}

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @ManyToOne(() => MenuItem, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'menuItemId' })
  menuItem: MenuItem | null;

  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  clientItemId: string | null;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unitPrice: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  lineTotal: string;
}
