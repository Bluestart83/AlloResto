import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from "typeorm";
import { Restaurant } from "./Restaurant";
import { MenuItem } from "./MenuItem";

@Entity("menu_categories")
export class MenuCategory {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "restaurant_id", type: "varchar" })
  restaurantId!: string;

  @ManyToOne(() => Restaurant, r => r.menuCategories, { onDelete: "CASCADE" })
  @JoinColumn({ name: "restaurant_id" })
  restaurant!: Restaurant;

  @Column({ type: "varchar", length: 100 })
  name!: string;

  @Column({ name: "display_order", type: "int", default: 0 })
  displayOrder!: number;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  // --- Relations ---
  @OneToMany(() => MenuItem, mi => mi.category)
  items!: MenuItem[];
}
