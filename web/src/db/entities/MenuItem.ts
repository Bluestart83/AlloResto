import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Restaurant } from "./Restaurant";
import { MenuCategory } from "./MenuCategory";

@Entity("menu_items")
export class MenuItem {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "restaurant_id" })
  restaurantId!: string;

  @ManyToOne(() => Restaurant, (r) => r.menuItems, { onDelete: "CASCADE" })
  @JoinColumn({ name: "restaurant_id" })
  restaurant!: Restaurant;

  @Column({ name: "category_id", nullable: true })
  categoryId!: string | null;

  @ManyToOne(() => MenuCategory, (mc) => mc.items, {
    onDelete: "SET NULL",
    nullable: true,
  })
  @JoinColumn({ name: "category_id" })
  category!: MenuCategory | null;

  @Column({ length: 255 })
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "decimal", precision: 8, scale: 2 })
  price!: number;

  // Options : tailles, suppléments, etc.
  // Ex: [{"name":"Taille","choices":[{"label":"Normale","price":0},{"label":"Grande","price":2}]}]
  @Column({ type: "simple-json", default: "[]" })
  options!: any[];

  // Allergènes stockés en JSON (compatible SQLite + PG)
  @Column({ type: "simple-json", default: "[]" })
  allergens!: string[];

  // Tags : "populaire", "nouveau", "épicé"
  @Column({ type: "simple-json", default: "[]" })
  tags!: string[];

  @Column({ name: "is_available", default: true })
  isAvailable!: boolean;

  @Column({ name: "display_order", type: "int", default: 0 })
  displayOrder!: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
