import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from "typeorm";

/**
 * Singleton global pricing configuration.
 * One row in the table — stores AI model rates, default margin, telecom cost,
 * base currency and exchange rates (auto-refreshed hourly).
 */
@Entity("pricing_config")
export class PricingConfig {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /**
   * AI token rates per model (in baseCurrency per 1M tokens).
   * Format: { "gpt-realtime": { textInput, textOutput, audioInput, audioOutput }, ... }
   */
  @Column({ name: "model_rates", type: "simple-json", default: "{}" })
  modelRates!: Record<string, {
    textInput: number;
    textOutput: number;
    audioInput: number;
    audioOutput: number;
  }>;

  /**
   * Default AI cost margin % for new restaurants.
   * Each restaurant can override this with its own aiCostMarginPct.
   */
  @Column({
    name: "default_margin_pct",
    type: "decimal",
    precision: 5,
    scale: 2,
    default: 30,
  })
  defaultMarginPct!: number;

  /**
   * Twilio / telecom cost per minute (in baseCurrency).
   * No margin applied — the client pays this directly.
   */
  @Column({
    name: "telecom_cost_per_min",
    type: "decimal",
    precision: 8,
    scale: 4,
    default: 0.008,
  })
  telecomCostPerMin!: number;

  /**
   * Base currency for model rates and telecom costs (always USD — OpenAI bills in USD).
   */
  @Column({
    name: "base_currency",
    type: "varchar",
    length: 3,
    default: "USD",
  })
  baseCurrency!: string;

  /**
   * Cached exchange rates from baseCurrency to other currencies.
   * Format: { "EUR": 0.92, "GBP": 0.79, ... }
   * Auto-refreshed hourly from frankfurter.app (ECB rates).
   */
  @Column({ name: "exchange_rates", type: "simple-json", default: "{}" })
  exchangeRates!: Record<string, number>;

  /**
   * When exchange rates were last fetched from the external API.
   */
  @Column({ name: "exchange_rates_updated_at", type: "datetime", nullable: true })
  exchangeRatesUpdatedAt!: Date | null;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
