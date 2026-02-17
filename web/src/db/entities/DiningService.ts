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

@Entity("dining_services")
export class DiningService {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "restaurant_id", type: "varchar" })
  restaurantId!: string;

  @ManyToOne("restaurants", "diningServices", { onDelete: "CASCADE" })
  @JoinColumn({ name: "restaurant_id" })
  restaurant!: Restaurant;

  @Column({ type: "varchar", length: 100 })
  name!: string;

  @Column({ type: "varchar", length: 30, default: "standard" })
  type!: string;

  // --- Quand ---
  @Column({ name: "day_of_week", type: "simple-json" })
  dayOfWeek!: number[];

  @Column({ name: "start_time", type: "varchar", length: 5 })
  startTime!: string;

  @Column({ name: "end_time", type: "varchar", length: 5 })
  endTime!: string;

  @Column({ name: "last_seating_time", type: "varchar", length: 5, nullable: true })
  lastSeatingTime!: string | null;

  // --- Capacité ---
  @Column({ name: "max_covers", type: "int" })
  maxCovers!: number;

  @Column({ name: "min_party_size", type: "int", default: 1 })
  minPartySize!: number;

  @Column({ name: "max_party_size", type: "int", nullable: true })
  maxPartySize!: number | null;

  // --- Créneaux ---
  @Column({ name: "slot_interval_min", type: "int", default: 30 })
  slotIntervalMin!: number;

  @Column({ name: "default_duration_min", type: "int", default: 90 })
  defaultDurationMin!: number;

  // --- Règles ---
  @Column({ name: "requires_prepayment", type: "boolean", default: false })
  requiresPrepayment!: boolean;

  @Column({ name: "prepayment_amount", type: "decimal", precision: 8, scale: 2, nullable: true })
  prepaymentAmount!: number | null;

  @Column({ name: "auto_confirm", type: "boolean", default: true })
  autoConfirm!: boolean;

  // --- Salles concernées (null = toutes) ---
  @Column({ name: "dining_room_ids", type: "simple-json", nullable: true })
  diningRoomIds!: string[] | null;

  // --- État ---
  @Column({ name: "is_private", type: "boolean", default: false })
  isPrivate!: boolean;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @Column({ name: "display_order", type: "int", default: 0 })
  displayOrder!: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
