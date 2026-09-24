import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type RestaurantStatus = 'active' | 'disabled';

@Entity('restaurants')
export class Restaurant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', default: 'active' })
  status: RestaurantStatus;

  @Column({ type: 'datetime', nullable: true })
  lastLoginAt: Date | null;

  @Column({ type: 'int', default: 1 })
  nextToken: number;

  @Column({ type: 'longtext', nullable: true })
  logoDataUrl: string | null;

  @Column({ default: true })
  requirePettyCash: boolean;

  @Column({ default: true })
  useInventory: boolean;

  @Column({ default: true })
  useTables: boolean;

  @Column({ type: 'json', nullable: true })
  floorPlan: unknown | null;

  @Column({ type: 'json', nullable: true })
  menuCategories: unknown | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
