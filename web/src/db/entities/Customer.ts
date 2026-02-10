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
import type { Restaurant } from "./Restaurant";
import type { Call } from "./Call";
import type { Order } from "./Order";
import type { Reservation } from "./Reservation";

@Entity("customers")
@Unique(["restaurantId", "phone"])
export class Customer {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "restaurant_id", type: "varchar" })
  restaurantId!: string;

  @ManyToOne("Restaurant", "customers", { onDelete: "CASCADE" })
  @JoinColumn({ name: "restaurant_id" })
  restaurant!: Restaurant;

  @Column({ type: "varchar", length: 20 })
  phone!: string;

  @Column({ name: "first_name", type: "varchar", length: 100, nullable: true })
  firstName!: string | null;

  @Column({ name: "last_name", type: "varchar", length: 100, nullable: true })
  lastName!: string | null;

  // --- Adresse de livraison mémorisée ---
  @Column({ name: "delivery_address", type: "text", nullable: true })
  deliveryAddress!: string | null;

  @Column({ name: "delivery_city", type: "varchar", length: 100, nullable: true })
  deliveryCity!: string | null;

  @Column({ name: "delivery_postal_code", type: "varchar", length: 10, nullable: true })
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
  @OneToMany("Call", "customer")
  calls!: Call[];

  @OneToMany("Order", "customer")
  orders!: Order[];

  @OneToMany("Reservation", "customer")
  reservations!: Reservation[];
}
