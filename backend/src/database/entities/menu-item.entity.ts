import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('menu_items')
@Index(['restaurantId', 'name'])
@Index(['restaurantId', 'clientId'], { unique: true })
export class MenuItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  restaurantId: string;

  @Column()
  clientId: string;

  @Column({ type: 'int', default: 0 })
  stock: number;

  @Column()
  name: string;

  @Column()
  category: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  salePrice: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'mediumtext', nullable: true })
  imageDataUrl: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
