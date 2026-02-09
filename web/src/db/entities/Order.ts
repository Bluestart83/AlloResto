import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToOne,
  OneToMany,
  JoinColumn,
} from "typeorm";
import { Restaurant } from "./Restaurant";
import { Call } from "./Call";
import { Customer } from "./Customer";
import { OrderItem } from "./OrderItem";

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "delivering"
  | "completed"
  | "cancelled";

export type OrderType = "pickup" | "delivery";
export type PaymentMethod = "cash" | "card" | "online";

@Entity("orders")
export class Order {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "restaurant_id" })
  restaurantId!: string;

  @ManyToOne(() => Restaurant, (r) => r.orders)
  @JoinColumn({ name: "restaurant_id" })
  restaurant!: Restaurant;

  @Column({ name: "call_id" })
  callId!: string;

  @OneToOne(() => Call, (c) => c.order)
  @JoinColumn({ name: "call_id" })
  call!: Call;

  @Column({ name: "customer_id", nullable: true })
  customerId!: string | null;

  @ManyToOne(() => Customer, (c) => c.orders, { nullable: true })
  @JoinColumn({ name: "customer_id" })
  customer!: Customer | null;

  @Column({ name: "order_number", type: "int", nullable: true })
  orderNumber!: number | null;

  // Snapshot client au moment de la commande
  @Column({ name: "customer_name", length: 255, nullable: true })
  customerName!: string | null;

  @Column({ name: "customer_phone", length: 20 })
  customerPhone!: string;

  // Type et livraison
  @Column({ name: "order_type", length: 20, default: "pickup" })
  orderType!: OrderType;

  @Column({ name: "delivery_address", type: "text", nullable: true })
  deliveryAddress!: string | null;

  @Column({ name: "delivery_lat", type: "decimal", precision: 10, scale: 7, nullable: true })
  deliveryLat!: number | null;

  @Column({ name: "delivery_lng", type: "decimal", precision: 10, scale: 7, nullable: true })
  deliveryLng!: number | null;

  @Column({ name: "delivery_distance_km", type: "decimal", precision: 5, scale: 1, nullable: true })
  deliveryDistanceKm!: number | null;

  @Column({ name: "delivery_duration_min", type: "int", nullable: true })
  deliveryDurationMin!: number | null;

  // Montant
  @Column({ type: "decimal", precision: 8, scale: 2, default: 0 })
  total!: number;

  @Column({
    name: "delivery_fee",
    type: "decimal",
    precision: 5,
    scale: 2,
    default: 0,
  })
  deliveryFee!: number;

  // Status
  @Column({ length: 50, default: "pending" })
  status!: OrderStatus;

  @Column({ name: "estimated_ready_at", type: "datetime", nullable: true })
  estimatedReadyAt!: Date | null;

  @Column({ name: "payment_method", length: 50, default: "cash" })
  paymentMethod!: PaymentMethod;

  @Column({ type: "text", nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  // --- Relations ---
  @OneToMany(() => OrderItem, (oi) => oi.order, { cascade: true })
  items!: OrderItem[];
}
