import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import type { Restaurant } from "./Restaurant";
import type { MenuCategory } from "./MenuCategory";

@Entity("menu_items")
export class MenuItem {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "restaurant_id", type: "varchar" })
  restaurantId!: string;

  @ManyToOne("Restaurant", "menuItems", { onDelete: "CASCADE" })
  @JoinColumn({ name: "restaurant_id" })
  restaurant!: Restaurant;

  @Column({ name: "category_id", type: "varchar", nullable: true })
  categoryId!: string | null;

  @ManyToOne("MenuCategory", "items", {
    onDelete: "SET NULL",
    nullable: true,
  })
  @JoinColumn({ name: "category_id" })
  category!: MenuCategory | null;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "decimal", precision: 8, scale: 2 })
  price!: number;

  // Options : tailles, suppléments, etc.
  @Column({ type: "simple-json", default: "[]" })
  options!: any[];

  // Ingrédients / composants du plat
  @Column({ type: "simple-json", default: "[]" })
  ingredients!: string[];

  // Allergènes stockés en JSON (compatible SQLite + PG)
  @Column({ type: "simple-json", default: "[]" })
  allergens!: string[];

  // Tags : "populaire", "nouveau", "épicé"
  @Column({ type: "simple-json", default: "[]" })
  tags!: string[];

  // Plage horaire de disponibilité (HH:MM)
  @Column({ name: "available_from", type: "varchar", length: 5, nullable: true })
  availableFrom!: string | null;

  @Column({ name: "available_to", type: "varchar", length: 5, nullable: true })
  availableTo!: string | null;

  @Column({ name: "is_available", type: "boolean", default: true })
  isAvailable!: boolean;

  @Column({ name: "display_order", type: "int", default: 0 })
  displayOrder!: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
