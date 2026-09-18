import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('expenses')
@Index(['restaurantId', 'date'])
@Index(['restaurantId', 'clientId'], { unique: true })
export class Expense {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  restaurantId: string;

  @Column()
  title: string;

  @Column()
  category: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column()
  clientId: string;

  @Column({ type: 'varchar', nullable: true })
  staffId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
