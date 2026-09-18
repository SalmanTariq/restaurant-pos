import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('dining_tables')
@Index(['restaurantId', 'tableNumber'], { unique: true })
export class DiningTable {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  restaurantId: string;

  @Column()
  tableNumber: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
