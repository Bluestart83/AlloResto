import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToOne,
  JoinColumn,
} from "typeorm";
import { Restaurant } from "./Restaurant";

@Entity("phone_lines")
export class PhoneLine {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "restaurant_id" })
  restaurantId!: string;

  @OneToOne(() => Restaurant, (r) => r.phoneLine, { onDelete: "CASCADE" })
  @JoinColumn({ name: "restaurant_id" })
  restaurant!: Restaurant;

  @Column({ name: "phone_number", length: 20, unique: true })
  phoneNumber!: string;

  @Column({ length: 50, default: "twilio" })
  provider!: string;

  // --- Credentials SIP propres au client ---
  // Si null → fallback sur .env (ligne de démo)
  @Column({ name: "sip_domain", length: 255, nullable: true })
  sipDomain!: string | null;

  @Column({ name: "sip_username", length: 255, nullable: true })
  sipUsername!: string | null;

  @Column({ name: "sip_password", length: 255, nullable: true })
  sipPassword!: string | null;

  @Column({ name: "twilio_trunk_sid", length: 255, nullable: true })
  twilioTrunkSid!: string | null;

  @Column({ name: "is_active", default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
