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
import type { Restaurant } from "./Restaurant";
import type { Customer } from "./Customer";
import type { OrderItem } from "./OrderItem";
import type { DeliveryTrip } from "./DeliveryTrip";

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "delivering"
  | "completed"
  | "cancelled";

export type OrderType = "pickup" | "delivery" | "dine_in";
export type PaymentMethod = "cash" | "card" | "online";

@Entity("orders")
export class Order {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "restaurant_id", type: "varchar" })
  restaurantId!: string;

  @ManyToOne(() => require("./Restaurant").Restaurant, "orders")
  @JoinColumn({ name: "restaurant_id" })
  restaurant!: Restaurant;

  /** UUID from sip-agent-server CallRecord (not a local FK) */
  @Column({ name: "call_id", type: "varchar", nullable: true })
  callId!: string | null;

  @Column({ name: "customer_id", type: "varchar", nullable: true })
  customerId!: string | null;

  @ManyToOne(() => require("./Customer").Customer, "orders", { nullable: true })
  @JoinColumn({ name: "customer_id" })
  customer!: Customer | null;

  @Column({ name: "order_number", type: "int", nullable: true })
  orderNumber!: number | null;

  // Snapshot client au moment de la commande
  @Column({ name: "customer_name", type: "varchar", length: 255, nullable: true })
  customerName!: string | null;

  @Column({ name: "customer_phone", type: "varchar", length: 20 })
  customerPhone!: string;

  // Type et livraison
  @Column({ name: "order_type", type: "varchar", length: 20, default: "pickup" })
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
  @Column({ type: "varchar", length: 50, default: "pending" })
  status!: OrderStatus;

  @Column({ name: "estimated_ready_at", type: "datetime", nullable: true })
  estimatedReadyAt!: Date | null;

  @Column({ name: "payment_method", type: "varchar", length: 50, default: "cash" })
  paymentMethod!: PaymentMethod;

  @Column({ type: "text", nullable: true })
  notes!: string | null;

  // --- Source & sync ---
  @Column({ type: "varchar", length: 50, default: "phone_ai" })
  source!: string;

  @Column({ name: "external_id", type: "varchar", length: 255, nullable: true })
  externalId!: string | null;

  @Column({ name: "external_raw_data", type: "simple-json", nullable: true })
  externalRawData!: Record<string, any> | null;

  // --- Planning fields ---
  @Column({ name: "order_size", type: "varchar", length: 1, nullable: true })
  orderSize!: "S" | "M" | "L" | null;

  @Column({ name: "cook_start_at", type: "datetime", nullable: true })
  cookStartAt!: Date | null;

  @Column({ name: "handoff_at", type: "datetime", nullable: true })
  handoffAt!: Date | null;

  // --- Tournée de livraison ---
  @Column({ name: "trip_id", type: "varchar", nullable: true })
  tripId!: string | null;

  @ManyToOne(() => require("./DeliveryTrip").DeliveryTrip, { nullable: true })
  @JoinColumn({ name: "trip_id" })
  trip!: DeliveryTrip | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  // --- Relations ---
  @OneToMany(() => require("./OrderItem").OrderItem, "order", { cascade: true })
  items!: OrderItem[];
}
