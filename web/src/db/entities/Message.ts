import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import type { Restaurant } from "./Restaurant";

export type MessageCategory =
  | "callback_request"
  | "complaint"
  | "info_request"
  | "special_request"
  | "other";

@Entity("messages")
export class Message {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "restaurant_id", type: "varchar" })
  restaurantId!: string;

  @ManyToOne("restaurants", "messages")
  @JoinColumn({ name: "restaurant_id" })
  restaurant!: Restaurant;

  /** UUID from sip-agent-server CallRecord (not a local FK) */
  @Column({ name: "call_id", type: "varchar", nullable: true })
  callId!: string | null;

  @Column({ name: "caller_phone", type: "varchar", length: 20 })
  callerPhone!: string;

  @Column({ name: "caller_name", type: "varchar", length: 255, nullable: true })
  callerName!: string | null;

  @Column({ type: "text" })
  content!: string;

  @Column({ type: "varchar", length: 50, default: "other" })
  category!: MessageCategory;

  @Column({ name: "is_read", type: "boolean", default: false })
  isRead!: boolean;

  @Column({ name: "is_urgent", type: "boolean", default: false })
  isUrgent!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
