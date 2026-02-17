import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import type { Restaurant } from "./Restaurant";
import type { PhoneLine } from "./PhoneLine";
import type { Customer } from "./Customer";

export type CallOutcome =
  | "in_progress"
  | "order_placed"
  | "reservation_placed"
  | "message_left"
  | "abandoned"
  | "info_only"
  | "error";

@Entity("calls")
export class Call {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "restaurant_id", type: "varchar" })
  restaurantId!: string;

  @ManyToOne("restaurants", "calls")
  @JoinColumn({ name: "restaurant_id" })
  restaurant!: Restaurant;

  @Column({ name: "phone_line_id", type: "varchar", nullable: true })
  phoneLineId!: string | null;

  @ManyToOne("phone_lines", { nullable: true })
  @JoinColumn({ name: "phone_line_id" })
  phoneLine!: PhoneLine | null;

  @Column({ name: "customer_id", type: "varchar", nullable: true })
  customerId!: string | null;

  @ManyToOne("customers", "calls", { nullable: true })
  @JoinColumn({ name: "customer_id" })
  customer!: Customer | null;

  @Column({ name: "caller_number", type: "varchar", length: 20 })
  callerNumber!: string;

  @Column({ name: "started_at", type: "datetime" })
  startedAt!: Date;

  @Column({ name: "ended_at", type: "datetime", nullable: true })
  endedAt!: Date | null;

  @Column({ name: "duration_sec", type: "int", nullable: true })
  durationSec!: number | null;

  // Transcript : [{role:"user"|"assistant", content:"...", timestamp:"..."}]
  @Column({ type: "simple-json", default: "[]" })
  transcript!: any[];

  @Column({ type: "varchar", length: 50, default: "in_progress" })
  outcome!: CallOutcome;

  @Column({
    name: "cost_telecom",
    type: "decimal",
    precision: 8,
    scale: 4,
    default: 0,
  })
  costTelecom!: number;

  @Column({
    name: "cost_ai",
    type: "decimal",
    precision: 8,
    scale: 4,
    default: 0,
  })
  costAi!: number;

  @Column({
    name: "cost_google",
    type: "decimal",
    precision: 8,
    scale: 4,
    default: 0,
  })
  costGoogle!: number;

  /** Currency of costAi, costTelecom, costGoogle (e.g. "EUR", "USD") */
  @Column({ name: "cost_currency", type: "varchar", length: 3, default: "EUR" })
  costCurrency!: string;

  // AI model + token tracking (OpenAI Realtime API)
  @Column({ name: "ai_model", type: "varchar", length: 100, nullable: true })
  aiModel!: string | null;

  @Column({ name: "input_tokens", type: "int", default: 0 })
  inputTokens!: number;

  @Column({ name: "output_tokens", type: "int", default: 0 })
  outputTokens!: number;

  @Column({ name: "input_audio_tokens", type: "int", default: 0 })
  inputAudioTokens!: number;

  @Column({ name: "output_audio_tokens", type: "int", default: 0 })
  outputAudioTokens!: number;

  @Column({ name: "recording_url", type: "text", nullable: true })
  recordingUrl!: string | null;

  @Column({ name: "error_log", type: "text", nullable: true })
  errorLog!: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
