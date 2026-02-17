import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Restaurant } from "./Restaurant";

export type SyncDirection = "inbound" | "outbound";
export type SyncAction =
  | "create"
  | "update"
  | "cancel"
  | "status_change"
  | "availability_push"
  | "sync_full"
  | "delete";
export type SyncStatus = "success" | "failed" | "conflict" | "retry" | "skipped";

@Entity("sync_logs")
export class SyncLog {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "restaurant_id", type: "varchar" })
  restaurantId!: string;

  @ManyToOne(() => Restaurant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "restaurant_id" })
  restaurant!: Restaurant;

  // --- Quoi ---
  @Column({ name: "entity_type", type: "varchar", length: 30 })
  entityType!: string;

  @Column({ name: "entity_id", type: "varchar", nullable: true })
  entityId!: string | null;

  @Column({ type: "varchar", length: 50 })
  platform!: string;

  @Column({ name: "external_id", type: "varchar", length: 255, nullable: true })
  externalId!: string | null;

  // --- Action ---
  @Column({ type: "varchar", length: 10 })
  direction!: SyncDirection;

  @Column({ type: "varchar", length: 30 })
  action!: SyncAction;

  // --- Résultat ---
  @Column({ type: "varchar", length: 20, default: "success" })
  status!: SyncStatus;

  @Column({ name: "request_payload", type: "simple-json", nullable: true })
  requestPayload!: Record<string, any> | null;

  @Column({ name: "response_payload", type: "simple-json", nullable: true })
  responsePayload!: Record<string, any> | null;

  @Column({ name: "error_message", type: "text", nullable: true })
  errorMessage!: string | null;

  @Column({ name: "conflict_resolution", type: "text", nullable: true })
  conflictResolution!: string | null;

  // --- Retry ---
  @Column({ name: "retry_count", type: "int", default: 0 })
  retryCount!: number;

  @Column({ name: "next_retry_at", type: "datetime", nullable: true })
  nextRetryAt!: Date | null;

  @Column({ name: "duration_ms", type: "int", nullable: true })
  durationMs!: number | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
