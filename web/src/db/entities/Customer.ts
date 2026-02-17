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

  @ManyToOne("restaurants", "customers", { onDelete: "CASCADE" })
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

  // --- Identité enrichie ---
  @Column({ type: "varchar", length: 255, nullable: true })
  email!: string | null;

  @Column({ type: "varchar", length: 10, nullable: true })
  gender!: string | null;

  @Column({ type: "date", nullable: true })
  birthday!: Date | null;

  @Column({ type: "varchar", length: 5, default: "fr" })
  locale!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  company!: string | null;

  // --- Préférences repas ---
  @Column({ type: "simple-json", nullable: true })
  allergies!: string[] | null;

  @Column({ name: "dietary_restrictions", type: "simple-json", nullable: true })
  dietaryRestrictions!: string[] | null;

  @Column({ name: "seating_preferences", type: "simple-json", nullable: true })
  seatingPreferences!: string[] | null;

  @Column({ name: "favorite_drinks", type: "simple-json", nullable: true })
  favoriteDrinks!: string[] | null;

  // --- Stats enrichies ---
  @Column({ name: "total_no_shows", type: "int", default: 0 })
  totalNoShows!: number;

  @Column({ name: "total_cancellations", type: "int", default: 0 })
  totalCancellations!: number;

  @Column({ name: "average_spend", type: "decimal", precision: 10, scale: 2, nullable: true })
  averageSpend!: number | null;

  @Column({ name: "first_visit_date", type: "date", nullable: true })
  firstVisitDate!: Date | null;

  // --- Classification ---
  @Column({ type: "simple-json", nullable: true })
  tags!: string[] | null;

  @Column({ name: "vip_level", type: "int", default: 0 })
  vipLevel!: number;

  @Column({ name: "client_type", type: "varchar", length: 30, nullable: true })
  clientType!: string | null;

  // --- Communication ---
  @Column({ name: "marketing_opt_in", type: "boolean", default: false })
  marketingOptIn!: boolean;

  @Column({ name: "sms_opt_in", type: "boolean", default: false })
  smsOptIn!: boolean;

  // --- Notes ---
  @Column({ name: "internal_notes", type: "text", nullable: true })
  internalNotes!: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  // --- Relations ---
  @OneToMany("calls", "customer")
  calls!: Call[];

  @OneToMany("orders", "customer")
  orders!: Order[];

  @OneToMany("reservations", "customer")
  reservations!: Reservation[];
}
