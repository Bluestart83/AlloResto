import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from "typeorm";
import type { Restaurant } from "./Restaurant";

@Entity("sync_platform_configs")
@Unique(["restaurantId", "platform"])
export class SyncPlatformConfig {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "restaurant_id", type: "varchar" })
  restaurantId!: string;

  @ManyToOne("Restaurant", "syncPlatformConfigs", { onDelete: "CASCADE" })
  @JoinColumn({ name: "restaurant_id" })
  restaurant!: Restaurant;

  @Column({ type: "varchar", length: 50 })
  platform!: string;

  // --- Credentials (chiffré AES-256-GCM côté applicatif) ---
  @Column({ type: "simple-json", default: "{}" })
  credentials!: Record<string, any>;

  // --- Mastering : pour quels types d'entités cette plateforme est source de vérité ---
  @Column({ name: "master_for", type: "simple-json", default: "[]" })
  masterFor!: string[];

  // --- Périmètre de sync ---
  @Column({ name: "sync_entities", type: "simple-json", default: '["reservation"]' })
  syncEntities!: string[];

  // --- Webhooks ---
  @Column({ name: "supports_webhook", type: "boolean", default: false })
  supportsWebhook!: boolean;

  @Column({ name: "webhook_url", type: "varchar", length: 500, nullable: true })
  webhookUrl!: string | null;

  @Column({ name: "webhook_secret", type: "varchar", length: 255, nullable: true })
  webhookSecret!: string | null;

  // --- Polling (fallback) ---
  @Column({ name: "poll_interval_sec", type: "int", default: 300 })
  pollIntervalSec!: number;

  // --- État ---
  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @Column({ name: "last_sync_at", type: "datetime", nullable: true })
  lastSyncAt!: Date | null;

  @Column({ name: "last_error", type: "text", nullable: true })
  lastError!: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
