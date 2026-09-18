import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('business_days')
@Index(['restaurantId', 'date'], { unique: true })
export class BusinessDay {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  restaurantId: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'datetime' })
  openedAt: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  pettyCash: string;

  @Column()
  openedBy: string;

  @CreateDateColumn()
  createdAt: Date;
}
