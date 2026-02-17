/**
 * exchange-rate.service.ts
 *
 * Fetches exchange rates from frankfurter.app (ECB rates, free, no API key).
 * Caches in PricingConfig entity, auto-refreshes if stale (> 1 hour).
 */

import { getDb } from "@/lib/db";
import type { PricingConfig } from "@/db/entities/PricingConfig";

const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const FRANKFURTER_URL = "https://api.frankfurter.app/latest?from=USD";

/**
 * Returns cached exchange rates, refreshing from API if stale (> 1 hour).
 * Returns a map like { "EUR": 0.92, "GBP": 0.79, ... }
 * USD is always 1.0 (identity).
 */
export async function getExchangeRates(): Promise<Record<string, number>> {
  const ds = await getDb();
  const repo = ds.getRepository<PricingConfig>("pricing_config");
  let config = await repo.findOne({ where: {} });

  if (!config) {
    // PricingConfig not yet seeded — return USD-only
    return { USD: 1 };
  }

  const lastUpdate = config.exchangeRatesUpdatedAt
    ? new Date(config.exchangeRatesUpdatedAt).getTime()
    : 0;
  const isStale = Date.now() - lastUpdate > REFRESH_INTERVAL_MS;

  if (isStale || !config.exchangeRates || Object.keys(config.exchangeRates).length === 0) {
    const freshRates = await fetchRatesFromApi();
    if (freshRates) {
      config.exchangeRates = freshRates;
      config.exchangeRatesUpdatedAt = new Date();
      await repo.save(config);
      console.log(`[EXCHANGE] Rates refreshed (${Object.keys(freshRates).length} currencies)`);
    }
  }

  return { USD: 1, ...config.exchangeRates };
}

/**
 * Get the exchange rate from USD to a target currency.
 * Returns 1.0 if target is USD or unknown.
 */
export async function getExchangeRate(targetCurrency: string): Promise<number> {
  if (targetCurrency === "USD") return 1;
  const rates = await getExchangeRates();
  return rates[targetCurrency] ?? 1;
}

/**
 * Convert an amount from USD to a target currency.
 */
export async function convertFromUsd(amountUsd: number, targetCurrency: string): Promise<number> {
  const rate = await getExchangeRate(targetCurrency);
  return amountUsd * rate;
}

/**
 * Fetch fresh exchange rates from frankfurter.app.
 * Returns null on error (caller should keep cached rates).
 */
async function fetchRatesFromApi(): Promise<Record<string, number> | null> {
  try {
    const resp = await fetch(FRANKFURTER_URL, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!resp.ok) {
      console.warn(`[EXCHANGE] API returned ${resp.status}`);
      return null;
    }
    const data = await resp.json();
    // data.rates = { "EUR": 0.92, "GBP": 0.79, ... }
    if (data.rates && typeof data.rates === "object") {
      return data.rates as Record<string, number>;
    }
    return null;
  } catch (e) {
    console.warn(`[EXCHANGE] Fetch failed: ${e}`);
    return null;
  }
}
