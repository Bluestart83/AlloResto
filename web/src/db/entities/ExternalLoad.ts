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

@Entity("external_loads")
export class ExternalLoad {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "restaurant_id", type: "varchar" })
  restaurantId!: string;

  @ManyToOne("Restaurant", "externalLoads")
  @JoinColumn({ name: "restaurant_id" })
  restaurant!: Restaurant;

  @Column({ type: "varchar", length: 20 })
  type!: "dine_in" | "phone" | "incident" | "prep_batch" | "other";

  // Primary resource (kept for quick filtering)
  @Column({ type: "varchar", length: 20 })
  resource!: "cuisine" | "preparation" | "comptoir" | "livraison";

  // All impacted resources
  @Column({ type: "simple-json", default: "[]" })
  resources!: string[];

  @Column({ type: "varchar", length: 10 })
  intensity!: "low" | "medium" | "high";

  @Column({ name: "points_per_slot", type: "int", default: 4 })
  pointsPerSlot!: number;

  @Column({ name: "start_time", type: "datetime" })
  startTime!: Date;

  @Column({ name: "duration_min", type: "int" })
  durationMin!: number;

  @Column({ name: "end_time", type: "datetime" })
  endTime!: Date;

  @Column({ type: "varchar", length: 255, nullable: true })
  label!: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
