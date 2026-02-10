import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from "typeorm";

@Entity("sync_external_mappings")
@Unique(["entityType", "entityId", "platform"])
@Unique(["platform", "externalId", "entityType"])
export class SyncExternalMapping {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // --- Référence interne (polymorphe) ---
  @Column({ name: "entity_type", type: "varchar", length: 30 })
  entityType!: string;

  @Column({ name: "entity_id", type: "varchar" })
  entityId!: string;

  // --- Référence externe ---
  @Column({ type: "varchar", length: 50 })
  platform!: string;

  @Column({ name: "external_id", type: "varchar", length: 255 })
  externalId!: string;

  @Column({ name: "external_secondary_id", type: "varchar", length: 255, nullable: true })
  externalSecondaryId!: string | null;

  // --- Données brutes plateforme ---
  @Column({ name: "external_raw_data", type: "simple-json", nullable: true })
  externalRawData!: Record<string, any> | null;

  // --- Sync status ---
  @Column({ name: "sync_status", type: "varchar", length: 20, default: "synced" })
  syncStatus!: string;

  @Column({ name: "synced_at", type: "datetime", nullable: true })
  syncedAt!: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
