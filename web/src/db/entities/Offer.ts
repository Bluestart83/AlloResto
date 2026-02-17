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
import type { MenuItem } from "./MenuItem";

@Entity("offers")
export class Offer {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "restaurant_id", type: "varchar" })
  restaurantId!: string;

  @ManyToOne(() => require("./Restaurant").Restaurant, "offers", { onDelete: "CASCADE" })
  @JoinColumn({ name: "restaurant_id" })
  restaurant!: Restaurant;

  @Column({ name: "menu_item_id", type: "varchar", nullable: true })
  menuItemId!: string | null;

  @ManyToOne(() => require("./MenuItem").MenuItem, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "menu_item_id" })
  menuItem!: MenuItem | null;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "varchar", length: 30, default: "menu" })
  type!: string;

  @Column({ name: "discount_percent", type: "int", nullable: true })
  discountPercent!: number | null;

  @Column({ name: "start_date", type: "date", nullable: true })
  startDate!: Date | null;

  @Column({ name: "end_date", type: "date", nullable: true })
  endDate!: Date | null;

  @Column({ name: "is_permanent", type: "boolean", default: false })
  isPermanent!: boolean;

  @Column({ name: "min_party_size", type: "int", nullable: true })
  minPartySize!: number | null;

  @Column({ name: "max_party_size", type: "int", nullable: true })
  maxPartySize!: number | null;

  @Column({ name: "min_dishes", type: "int", nullable: true })
  minDishes!: number | null;

  @Column({ name: "max_dishes", type: "int", nullable: true })
  maxDishes!: number | null;

  @Column({ name: "has_prepayment", type: "boolean", default: false })
  hasPrepayment!: boolean;

  @Column({ name: "prepayment_amount", type: "decimal", precision: 8, scale: 2, nullable: true })
  prepaymentAmount!: number | null;

  @Column({ name: "prepayment_type", type: "varchar", length: 20, nullable: true })
  prepaymentType!: string | null;

  @Column({ name: "is_bookable", type: "boolean", default: true })
  isBookable!: boolean;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
