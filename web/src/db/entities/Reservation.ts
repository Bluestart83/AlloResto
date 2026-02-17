import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import type { Restaurant } from "./Restaurant";
import type { Call } from "./Call";
import type { Customer } from "./Customer";
import type { DiningService } from "./DiningService";
import type { DiningRoom } from "./DiningRoom";
import type { Offer } from "./Offer";

export type ReservationStatus =
  | "pending"
  | "confirmed"
  | "seated"
  | "completed"
  | "cancelled"
  | "no_show";

@Entity("reservations")
export class Reservation {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "restaurant_id", type: "varchar" })
  restaurantId!: string;

  @ManyToOne("restaurants", "reservations")
  @JoinColumn({ name: "restaurant_id" })
  restaurant!: Restaurant;

  @Column({ name: "call_id", type: "varchar", nullable: true })
  callId!: string | null;

  @ManyToOne("calls", { nullable: true })
  @JoinColumn({ name: "call_id" })
  call!: Call | null;

  @Column({ name: "customer_id", type: "varchar", nullable: true })
  customerId!: string | null;

  @ManyToOne("customers", "reservations", { nullable: true })
  @JoinColumn({ name: "customer_id" })
  customer!: Customer | null;

  @Column({ name: "customer_name", type: "varchar", length: 255, nullable: true })
  customerName!: string | null;

  @Column({ name: "customer_phone", type: "varchar", length: 20 })
  customerPhone!: string;

  @Column({ name: "party_size", type: "int" })
  partySize!: number;

  @Column({ name: "reservation_time", type: "datetime" })
  reservationTime!: Date;

  @Column({ name: "end_time", type: "datetime", nullable: true })
  endTime!: Date | null;

  @Column({ type: "varchar", length: 50, default: "pending" })
  status!: ReservationStatus;

  @Column({ name: "seating_preference", type: "varchar", length: 50, nullable: true })
  seatingPreference!: string | null;

  @Column({ type: "text", nullable: true })
  notes!: string | null;

  // --- Source & sync (mono-source, pas d'ExternalMapping) ---
  @Column({ type: "varchar", length: 50, default: "phone_ai" })
  source!: string;

  @Column({ name: "external_id", type: "varchar", length: 255, nullable: true })
  externalId!: string | null;

  @Column({ name: "external_raw_data", type: "simple-json", nullable: true })
  externalRawData!: Record<string, any> | null;

  @Column({ type: "int", default: 1 })
  version!: number;

  // --- Placement ---
  @Column({ name: "service_id", type: "varchar", nullable: true })
  serviceId!: string | null;

  @ManyToOne("dining_services", { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "service_id" })
  diningService!: DiningService | null;

  @Column({ name: "dining_room_id", type: "varchar", nullable: true })
  diningRoomId!: string | null;

  @ManyToOne("dining_rooms", { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "dining_room_id" })
  diningRoom!: DiningRoom | null;

  @Column({ name: "table_ids", type: "simple-json", nullable: true })
  tableIds!: string[] | null;

  // --- Convives ---
  @Column({ type: "int", nullable: true })
  adults!: number | null;

  @Column({ type: "int", default: 0 })
  children!: number;

  @Column({ name: "duration_min", type: "int", nullable: true })
  durationMin!: number | null;

  // --- Offre ---
  @Column({ name: "offer_id", type: "varchar", nullable: true })
  offerId!: string | null;

  @ManyToOne("offers", { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "offer_id" })
  offer!: Offer | null;

  @Column({ name: "menu_selection", type: "simple-json", nullable: true })
  menuSelection!: Record<string, any> | null;

  // --- Prépaiement ---
  @Column({ name: "prepayment_required", type: "boolean", default: false })
  prepaymentRequired!: boolean;

  @Column({ name: "prepayment_amount", type: "decimal", precision: 8, scale: 2, nullable: true })
  prepaymentAmount!: number | null;

  @Column({ name: "prepayment_status", type: "varchar", length: 20, nullable: true })
  prepaymentStatus!: string | null;

  @Column({ name: "payment_ref", type: "varchar", length: 255, nullable: true })
  paymentRef!: string | null;

  // --- Préférences client (snapshot sur la résa) ---
  @Column({ type: "simple-json", nullable: true })
  allergies!: string[] | null;

  @Column({ name: "dietary_restrictions", type: "simple-json", nullable: true })
  dietaryRestrictions!: string[] | null;

  @Column({ name: "special_requests", type: "simple-json", nullable: true })
  specialRequests!: string[] | null;

  @Column({ type: "varchar", length: 30, nullable: true })
  occasion!: string | null;

  // --- Annulation ---
  @Column({ name: "cancel_reason", type: "text", nullable: true })
  cancelReason!: string | null;

  @Column({ name: "cancel_actor", type: "varchar", length: 20, nullable: true })
  cancelActor!: string | null;

  // --- Rappels ---
  @Column({ name: "confirmation_sent", type: "boolean", default: false })
  confirmationSent!: boolean;

  @Column({ name: "reminder_sent", type: "boolean", default: false })
  reminderSent!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
