import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Unique,
} from "typeorm";
import { Restaurant } from "./Restaurant";
import { Call } from "./Call";
import { Order } from "./Order";

@Entity("customers")
@Unique(["restaurantId", "phone"])
export class Customer {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "restaurant_id" })
  restaurantId!: string;

  @ManyToOne(() => Restaurant, (r) => r.customers, { onDelete: "CASCADE" })
  @JoinColumn({ name: "restaurant_id" })
  restaurant!: Restaurant;

  @Column({ length: 20 })
  phone!: string;

  @Column({ name: "first_name", length: 100, nullable: true })
  firstName!: string | null;

  @Column({ name: "last_name", length: 100, nullable: true })
  lastName!: string | null;

  // --- Adresse de livraison mémorisée ---
  @Column({ name: "delivery_address", type: "text", nullable: true })
  deliveryAddress!: string | null;

  @Column({ name: "delivery_city", length: 100, nullable: true })
  deliveryCity!: string | null;

  @Column({ name: "delivery_postal_code", length: 10, nullable: true })
  deliveryPostalCode!: string | null;

  @Column({ name: "delivery_notes", type: "text", nullable: true })
  deliveryNotes!: string | null;

  @Column({
    name: "delivery_lat",
    type: "decimal",
    precision: 10,
    scale: 7,
    nullable: true,
  })
  deliveryLat!: number | null;

  @Column({
    name: "delivery_lng",
    type: "decimal",
    precision: 10,
    scale: 7,
    nullable: true,
  })
  deliveryLng!: number | null;

  // --- Stats ---
  @Column({ name: "total_orders", type: "int", default: 0 })
  totalOrders!: number;

  @Column({
    name: "total_spent",
    type: "decimal",
    precision: 10,
    scale: 2,
    default: 0,
  })
  totalSpent!: number;

  @Column({ name: "last_order_at", type: "datetime", nullable: true })
  lastOrderAt!: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  // --- Relations ---
  @OneToMany(() => Call, (c) => c.customer)
  calls!: Call[];

  @OneToMany(() => Order, (o) => o.customer)
  orders!: Order[];
}
