import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  OneToOne,
} from "typeorm";
import type { PhoneLine } from "./PhoneLine";
import type { Customer } from "./Customer";
import type { MenuCategory } from "./MenuCategory";
import type { MenuItem } from "./MenuItem";
import type { Call } from "./Call";
import type { Order } from "./Order";
import type { Faq } from "./Faq";
import type { Reservation } from "./Reservation";
import type { DiningRoom } from "./DiningRoom";
import type { DiningTable } from "./DiningTable";
import type { Message } from "./Message";
import type { ExternalLoad } from "./ExternalLoad";
import type { SyncPlatformConfig } from "./SyncPlatformConfig";
import type { DiningService } from "./DiningService";
import type { Offer } from "./Offer";

@Entity("restaurants")
export class Restaurant {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({ name: "cuisine_type", type: "varchar", length: 50, default: "other" })
  cuisineType!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "simple-json", default: "[]" })
  categories!: string[];

  @Column({ type: "text", nullable: true })
  address!: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  city!: string | null;

  @Column({ name: "postal_code", type: "varchar", length: 10, nullable: true })
  postalCode!: string | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  phone!: string | null;

  @Column({ name: "contact_name", type: "varchar", length: 255, nullable: true })
  contactName!: string | null;

  @Column({ name: "contact_email", type: "varchar", length: 255, nullable: true })
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

  @Column({ name: "ai_voice", type: "varchar", length: 50, default: "sage" })
  aiVoice!: string;

  @Column({ name: "ai_instructions", type: "text", nullable: true })
  aiInstructions!: string | null;

  // --- Config livraison ---
  @Column({ name: "delivery_enabled", type: "boolean", default: false })
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

  // --- Config réservation ---
  @Column({ name: "reservation_enabled", type: "boolean", default: false })
  reservationEnabled!: boolean;

  @Column({ name: "total_seats", type: "int", default: 0 })
  totalSeats!: number;

  @Column({ name: "avg_meal_duration_min", type: "int", default: 90 })
  avgMealDurationMin!: number;

  @Column({ name: "min_reservation_advance_min", type: "int", default: 30 })
  minReservationAdvanceMin!: number;

  @Column({ name: "max_reservation_advance_days", type: "int", default: 30 })
  maxReservationAdvanceDays!: number;

  // JSONB sur Postgres, TEXT (JSON stringifié) sur SQLite
  @Column({ name: "opening_hours", type: "simple-json", default: "{}" })
  openingHours!: Record<string, any>;

  @Column({ name: "opening_hours_text", type: "simple-json", default: "[]" })
  openingHoursText!: string[];

  // --- Web & photos ---
  @Column({ type: "text", nullable: true })
  website!: string | null;

  @Column({ name: "menu_url", type: "text", nullable: true })
  menuUrl!: string | null;

  @Column({ name: "cover_image", type: "text", nullable: true })
  coverImage!: string | null;

  @Column({ name: "gallery", type: "simple-json", default: "[]" })
  gallery!: string[];

  // --- Données brutes API (debug / ré-import) ---
  @Column({ name: "google_place_raw", type: "simple-json", nullable: true })
  googlePlaceRaw!: Record<string, any> | null;

  @Column({ name: "serpapi_photos_raw", type: "simple-json", nullable: true })
  serpApiPhotosRaw!: Record<string, any> | null;

  // --- Config planning ---
  @Column({ name: "planning_config", type: "simple-json", default: "{}" })
  planningConfig!: Record<string, any>;

  // --- Suivi de commande par téléphone ---
  @Column({ name: "order_status_enabled", type: "boolean", default: false })
  orderStatusEnabled!: boolean;

  // --- Mode SIP ---
  @Column({ name: "sip_enabled", type: "boolean", default: false })
  sipEnabled!: boolean;

  @Column({ name: "sip_bridge", type: "boolean", default: false })
  sipBridge!: boolean;

  @Column({ name: "agent_id", type: "varchar", length: 36, nullable: true })
  agentId!: string | null;

  @Column({ name: "final_customer_id", type: "varchar", length: 36, nullable: true })
  finalCustomerId!: string | null;

  // --- Config transfert d'appel ---
  @Column({ name: "transfer_enabled", type: "boolean", default: false })
  transferEnabled!: boolean;

  @Column({ name: "transfer_phone_number", type: "varchar", length: 20, nullable: true })
  transferPhoneNumber!: string | null;

  @Column({ name: "transfer_automatic", type: "boolean", default: false })
  transferAutomatic!: boolean;

  @Column({ name: "transfer_cases", type: "text", nullable: true })
  transferCases!: string | null;

  @Column({ name: "max_parallel_calls", type: "int", default: 10 })
  maxParallelCalls!: number;

  /**
   * AI cost margin % for this restaurant (null = use global default from PricingConfig).
   */
  @Column({
    name: "ai_cost_margin_pct",
    type: "decimal",
    precision: 5,
    scale: 2,
    nullable: true,
  })
  aiCostMarginPct!: number | null;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  // --- Config sync plateformes ---
  @Column({ type: "varchar", length: 50, default: "Europe/Paris" })
  timezone!: string;

  @Column({ type: "varchar", length: 3, default: "EUR" })
  currency!: string;

  @Column({ name: "default_locale", type: "varchar", length: 5, default: "fr" })
  defaultLocale!: string;

  @Column({ name: "cancellation_delay_hours", type: "int", default: 2 })
  cancellationDelayHours!: number;

  @Column({ name: "auto_confirm_reservation", type: "boolean", default: true })
  autoConfirmReservation!: boolean;

  @Column({ name: "reminder_hours_before", type: "int", default: 24 })
  reminderHoursBefore!: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  // --- Relations (string refs to avoid circular deps with Turbopack) ---
  @OneToOne("PhoneLine", "restaurant")
  phoneLine!: PhoneLine;

  @OneToMany("Customer", "restaurant")
  customers!: Customer[];

  @OneToMany("MenuCategory", "restaurant")
  menuCategories!: MenuCategory[];

  @OneToMany("MenuItem", "restaurant")
  menuItems!: MenuItem[];

  @OneToMany("Call", "restaurant")
  calls!: Call[];

  @OneToMany("Order", "restaurant")
  orders!: Order[];

  @OneToMany("Faq", "restaurant")
  faqs!: Faq[];

  @OneToMany("Reservation", "restaurant")
  reservations!: Reservation[];

  @OneToMany("DiningRoom", "restaurant")
  diningRooms!: DiningRoom[];

  @OneToMany("DiningTable", "restaurant")
  diningTables!: DiningTable[];

  @OneToMany("Message", "restaurant")
  messages!: Message[];

  @OneToMany("ExternalLoad", "restaurant")
  externalLoads!: ExternalLoad[];

  @OneToMany("SyncPlatformConfig", "restaurant")
  syncPlatformConfigs!: SyncPlatformConfig[];

  @OneToMany("DiningService", "restaurant")
  diningServices!: DiningService[];

  @OneToMany("Offer", "restaurant")
  offers!: Offer[];
}
