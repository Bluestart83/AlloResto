import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToOne,
  JoinColumn,
} from "typeorm";
import type { Restaurant } from "./Restaurant";

@Entity("phone_lines")
export class PhoneLine {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "restaurant_id", type: "varchar" })
  restaurantId!: string;

  @OneToOne("Restaurant", "phoneLine", { onDelete: "CASCADE" })
  @JoinColumn({ name: "restaurant_id" })
  restaurant!: Restaurant;

  @Column({ name: "phone_number", type: "varchar", length: 20, unique: true })
  phoneNumber!: string;

  @Column({ type: "varchar", length: 50, default: "twilio" })
  provider!: string;

  // --- Config SIP propre au client ---
  // Si null → fallback sur .env (ligne de démo)
  @Column({ name: "sip_transport", type: "varchar", length: 10, nullable: true })
  sipTransport!: string | null;  // "udp" | "tcp" | "tls" — null = default (udp)

  @Column({ name: "sip_domain", type: "varchar", length: 255, nullable: true })
  sipDomain!: string | null;

  @Column({ name: "sip_username", type: "varchar", length: 255, nullable: true })
  sipUsername!: string | null;

  @Column({ name: "sip_password", type: "varchar", length: 255, nullable: true })
  sipPassword!: string | null;

  @Column({ name: "twilio_trunk_sid", type: "varchar", length: 255, nullable: true })
  twilioTrunkSid!: string | null;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
