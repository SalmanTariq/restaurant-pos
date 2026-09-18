import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('wage_staff')
@Index(['restaurantId', 'clientId'], { unique: true })
export class WageStaff {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  restaurantId: string;

  @Column()
  clientId: string;

  @Column()
  name: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  dailyWage: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
