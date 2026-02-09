import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from "typeorm";
import { Restaurant } from "./Restaurant";
import { PhoneLine } from "./PhoneLine";
import { Customer } from "./Customer";
import { Order } from "./Order";

export type CallOutcome =
  | "in_progress"
  | "order_placed"
  | "abandoned"
  | "info_only"
  | "error";

@Entity("calls")
export class Call {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "restaurant_id" })
  restaurantId!: string;

  @ManyToOne(() => Restaurant, (r) => r.calls)
  @JoinColumn({ name: "restaurant_id" })
  restaurant!: Restaurant;

  @Column({ name: "phone_line_id", nullable: true })
  phoneLineId!: string | null;

  @ManyToOne(() => PhoneLine, { nullable: true })
  @JoinColumn({ name: "phone_line_id" })
  phoneLine!: PhoneLine | null;

  @Column({ name: "customer_id", nullable: true })
  customerId!: string | null;

  @ManyToOne(() => Customer, (c) => c.calls, { nullable: true })
  @JoinColumn({ name: "customer_id" })
  customer!: Customer | null;

  @Column({ name: "caller_number", length: 20 })
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

  @Column({ length: 50, default: "in_progress" })
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

  @Column({ name: "recording_url", type: "text", nullable: true })
  recordingUrl!: string | null;

  @Column({ name: "error_log", type: "text", nullable: true })
  errorLog!: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  // --- Relations ---
  @OneToOne(() => Order, (o) => o.call, { nullable: true })
  order!: Order | null;
}
