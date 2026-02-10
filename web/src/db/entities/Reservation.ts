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
import type { Call } from "./Call";
import type { Customer } from "./Customer";

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

  @ManyToOne("Restaurant", "reservations")
  @JoinColumn({ name: "restaurant_id" })
  restaurant!: Restaurant;

  @Column({ name: "call_id", type: "varchar", nullable: true })
  callId!: string | null;

  @ManyToOne("Call", { nullable: true })
  @JoinColumn({ name: "call_id" })
  call!: Call | null;

  @Column({ name: "customer_id", type: "varchar", nullable: true })
  customerId!: string | null;

  @ManyToOne("Customer", "reservations", { nullable: true })
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

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
