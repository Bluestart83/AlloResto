import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  OneToOne,
} from "typeorm";
import { PhoneLine } from "./PhoneLine";
import { Customer } from "./Customer";
import { MenuCategory } from "./MenuCategory";
import { MenuItem } from "./MenuItem";
import { Call } from "./Call";
import { Order } from "./Order";
import { Faq } from "./Faq";

@Entity("restaurants")
export class Restaurant {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ length: 255 })
  name!: string;

  @Column({ name: "cuisine_type", length: 50, default: "other" })
  cuisineType!: string;

  @Column({ type: "text", nullable: true })
  address!: string | null;

  @Column({ length: 100, nullable: true })
  city!: string | null;

  @Column({ name: "postal_code", length: 10, nullable: true })
  postalCode!: string | null;

  @Column({ length: 20, nullable: true })
  phone!: string | null;

  @Column({ name: "contact_name", length: 255, nullable: true })
  contactName!: string | null;

  @Column({ name: "contact_email", length: 255, nullable: true })
  contactEmail!: string | null;

  // --- Coordonnées GPS (géocodées au setup) ---
  @Column({ type: "decimal", precision: 10, scale: 7, nullable: true })
  lat!: number | null;

  @Column({ type: "decimal", precision: 10, scale: 7, nullable: true })
  lng!: number | null;

  // --- Config IA ---
  @Column({
    name: "welcome_message",
    type: "text",
    default: "Bienvenue, que souhaitez-vous commander ?",
  })
  welcomeMessage!: string;

  @Column({ name: "ai_voice", length: 50, default: "sage" })
  aiVoice!: string;

  @Column({ name: "ai_instructions", type: "text", nullable: true })
  aiInstructions!: string | null;

  // --- Config livraison ---
  @Column({ name: "delivery_enabled", default: false })
  deliveryEnabled!: boolean;

  @Column({
    name: "delivery_radius_km",
    type: "decimal",
    precision: 5,
    scale: 2,
    default: 5.0,
  })
  deliveryRadiusKm!: number;

  @Column({
    name: "delivery_fee",
    type: "decimal",
    precision: 5,
    scale: 2,
    default: 0,
  })
  deliveryFee!: number;

  @Column({
    name: "delivery_free_above",
    type: "decimal",
    precision: 5,
    scale: 2,
    nullable: true,
  })
  deliveryFreeAbove!: number | null;

  @Column({
    name: "min_order_amount",
    type: "decimal",
    precision: 5,
    scale: 2,
    default: 0,
  })
  minOrderAmount!: number;

  @Column({ name: "avg_prep_time_min", type: "int", default: 30 })
  avgPrepTimeMin!: number;

  // JSONB sur Postgres, TEXT (JSON stringifié) sur SQLite
  @Column({ name: "opening_hours", type: "simple-json", default: "{}" })
  openingHours!: Record<string, any>;

  @Column({ name: "is_active", default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  // --- Relations ---
  @OneToOne(() => PhoneLine, (pl) => pl.restaurant)
  phoneLine!: PhoneLine;

  @OneToMany(() => Customer, (c) => c.restaurant)
  customers!: Customer[];

  @OneToMany(() => MenuCategory, (mc) => mc.restaurant)
  menuCategories!: MenuCategory[];

  @OneToMany(() => MenuItem, (mi) => mi.restaurant)
  menuItems!: MenuItem[];

  @OneToMany(() => Call, (c) => c.restaurant)
  calls!: Call[];

  @OneToMany(() => Order, (o) => o.restaurant)
  orders!: Order[];

  @OneToMany(() => Faq, (f) => f.restaurant)
  faqs!: Faq[];
}
