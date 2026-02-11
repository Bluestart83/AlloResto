/**
 * /api/ai-pricing — Global pricing configuration (DB-backed)
 *
 * GET  → returns current pricing (model rates, default margin, telecom cost, exchange rates)
 * PUT  → updates pricing config (admin only)
 *
 * Single-row in `pricing_config` table, auto-seeded with defaults on first read.
 * Exchange rates auto-refresh hourly via getExchangeRates().
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { PricingConfig } from "@/db/entities/PricingConfig";
import { getExchangeRates } from "@/services/exchange-rate.service";

// Default rates (USD per 1M tokens) — seeded on first access
const DEFAULT_MODEL_RATES: Record<string, {
  textInput: number;
  textOutput: number;
  audioInput: number;
  audioOutput: number;
}> = {
  "gpt-4o-realtime-preview": {
    textInput: 4.00,
    textOutput: 16.00,
    audioInput: 32.00,
    audioOutput: 64.00,
  },
  "gpt-realtime": {
    textInput: 4.00,
    textOutput: 16.00,
    audioInput: 32.00,
    audioOutput: 64.00,
  },
  "gpt-realtime-mini": {
    textInput: 0.60,
    textOutput: 2.40,
    audioInput: 10.00,
    audioOutput: 20.00,
  },
};

async function getOrCreateConfig() {
  const ds = await getDb();
  const repo = ds.getRepository(PricingConfig);

  let config = await repo.findOne({ where: {} });
  if (!config) {
    // Seed with defaults
    config = repo.create({
      modelRates: DEFAULT_MODEL_RATES,
      defaultMarginPct: 30,
      telecomCostPerMin: 0.008,
      baseCurrency: "USD",
      exchangeRates: {},
      exchangeRatesUpdatedAt: null,
    } as Partial<PricingConfig>) as PricingConfig;
    config = await repo.save(config);
    console.log("[PRICING] Config seeded with defaults");
  }
  return config;
}

// GET /api/ai-pricing
export async function GET() {
  const config = await getOrCreateConfig();

  // Trigger exchange rate refresh if stale (auto-handled by service)
  const exchangeRates = await getExchangeRates();

  return NextResponse.json({
    models: config.modelRates,
    defaultMarginPct: Number(config.defaultMarginPct),
    telecomCostPerMin: Number(config.telecomCostPerMin),
    baseCurrency: config.baseCurrency || "USD",
    exchangeRates,
    exchangeRatesUpdatedAt: config.exchangeRatesUpdatedAt,
    updatedAt: config.updatedAt,
  });
}

// PUT /api/ai-pricing — update pricing config
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const ds = await getDb();
  const repo = ds.getRepository(PricingConfig);

  const config = await getOrCreateConfig();

  if (body.models !== undefined) {
    config.modelRates = body.models;
  }
  if (body.defaultMarginPct !== undefined) {
    config.defaultMarginPct = body.defaultMarginPct;
  }
  if (body.telecomCostPerMin !== undefined) {
    config.telecomCostPerMin = body.telecomCostPerMin;
  }

  const saved = await repo.save(config);

  // Refresh exchange rates
  const exchangeRates = await getExchangeRates();

  return NextResponse.json({
    models: saved.modelRates,
    defaultMarginPct: Number(saved.defaultMarginPct),
    telecomCostPerMin: Number(saved.telecomCostPerMin),
    baseCurrency: saved.baseCurrency || "USD",
    exchangeRates,
    exchangeRatesUpdatedAt: saved.exchangeRatesUpdatedAt,
    updatedAt: saved.updatedAt,
  });
}
