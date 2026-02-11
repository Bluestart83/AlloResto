/**
 * Serveur vocal IA pour prise de commande restaurant
 * Twilio Programmable Voice + Media Streams + OpenAI Realtime API
 *
 * Architecture:
 *   Client appelle le numéro Twilio
 *     → Twilio stream l'audio en WebSocket (µ-law 8kHz)
 *     → Ce serveur proxy vers OpenAI Realtime API
 *     → OpenAI répond en audio
 *     → Ce serveur renvoie l'audio à Twilio
 *     → Le client entend la réponse
 *
 *   Données chargées dynamiquement depuis l'API Next.js :
 *     - System prompt avec menu, prix, options
 *     - FAQ / base de connaissances
 *     - Contexte client (prénom, adresse, historique)
 *     - Config livraison (frais, minimum, rayon)
 *     - Tools (function calling) : check_availability, confirm_order,
 *       confirm_reservation, save_customer_info, log_new_faq, leave_message
 */

import "dotenv/config";
import http from "http";
import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import fastifyCors from "@fastify/cors";
import WebSocket from "ws";
import twilio from "twilio";

// ============================================================
// CONFIGURATION
// ============================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const PORT = parseInt(process.env.PORT || "5050", 10);
const NEXT_API_URL = process.env.NEXT_API_URL || "http://localhost:3000";
const RESTAURANT_ID = process.env.RESTAURANT_ID || "";
const MAX_CALL_DURATION = parseInt(process.env.MAX_CALL_DURATION || "600", 10); // 10 min par défaut
const HANGUP_DELAY_S = 0.5; // petit buffer réseau après confirmation playback
const MARK_DRAIN_TIMEOUT_MS = 8000; // timeout max pour attendre les marks (playback audio)

// VAD (Voice Activity Detection) — OpenAI Realtime turn detection
const VAD_THRESHOLD = parseFloat(process.env.VAD_THRESHOLD || "0.5"); // 0.0-1.0 sensibilité
const VAD_SILENCE_MS = parseInt(process.env.VAD_SILENCE_MS || "500", 10); // ms de silence avant fin de tour
const VAD_PREFIX_PADDING_MS = parseInt(process.env.VAD_PREFIX_PADDING_MS || "300", 10); // ms d'audio avant la parole détectée

// Événements OpenAI à logger (pour debug)
const LOG_EVENT_TYPES = [
  "error",
  "response.done",
  "input_audio_buffer.speech_started",
  "input_audio_buffer.speech_stopped",
  "response.content.done",
  "session.created",
  "session.updated",
];

// ============================================================
// TYPES
// ============================================================

interface Ctx {
  restaurant_id: string;
  caller_phone: string;
  call_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  call_start: Date;
  order_placed: boolean;
  reservation_placed: boolean;
  message_left: boolean;
  had_conversation: boolean;
  transcript: { role: string; content: string; timestamp: string }[];
  avg_prep_time_min: number;
  delivery_enabled: boolean;
  last_availability_check: Record<string, any> | null;
  should_hangup: boolean;
  transferred: boolean;
  transfer_phone: string | null;
  transfer_reason: string | null;
  twilio_call_sid: string | null;
  bridge_call_sid: string | null;
  item_map: Record<string, { id: string; name: string }>;
  phone_line_id: string | null;
  ai_model: string | null;
  ai_cost_margin_pct: number;
  /** Restaurant currency (EUR, USD, etc.) */
  currency: string;
  /** Exchange rate from USD to restaurant currency */
  exchange_rate_to_local: number;
  // Token usage accumulators (summed across all response.done events)
  input_tokens: number;
  output_tokens: number;
  input_audio_tokens: number;
  output_audio_tokens: number;
}

type ToolHandler = (
  args: Record<string, any>,
  ctx: Ctx,
) => Promise<Record<string, any>>;

// ============================================================
// HELPERS
// ============================================================

function sleep(seconds: number): Promise<void> {
  return new Promise((r) => setTimeout(r, seconds * 1000));
}

function nowISO(): string {
  return new Date().toISOString();
}

function parisNow(): Date {
  // Return current time (we use Intl for formatting when needed)
  return new Date();
}

function formatParisTime(date: Date): string {
  return date.toLocaleTimeString("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ============================================================
// AI PRICING CACHE — Fetched from Next.js, refreshed every 24h
// ============================================================

interface ModelRates {
  textInput: number;   // USD per 1M tokens
  textOutput: number;
  audioInput: number;
  audioOutput: number;
}

interface PricingData {
  models: Record<string, ModelRates>;
  telecomCostPerMin: number;
  baseCurrency: string; // devise fournisseur IA (USD pour OpenAI)
  fetchedAt: number; // Date.now()
}

let pricingCache: PricingData | null = null;
const PRICING_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// Fallback rates (USD per 1M tokens) if API is unreachable
const FALLBACK_RATES: ModelRates = {
  textInput: 4.00,
  textOutput: 16.00,
  audioInput: 32.00,
  audioOutput: 64.00,
};

async function fetchPricing(): Promise<PricingData> {
  try {
    const resp = await fetch(`${NEXT_API_URL}/api/ai-pricing`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (resp.ok) {
      const data = await resp.json();
      const result: PricingData = { models: data.models, telecomCostPerMin: data.telecomCostPerMin ?? 0.008, baseCurrency: data.baseCurrency || "USD", fetchedAt: Date.now() };
      console.log(`[PRICING] Rates fetched (${Object.keys(data.models).length} models)`);
      return result;
    }
  } catch (e) {
    console.warn(`[PRICING] Fetch failed, using fallback: ${e}`);
  }
  return { models: { fallback: FALLBACK_RATES }, telecomCostPerMin: 0.008, baseCurrency: "USD", fetchedAt: Date.now() };
}

async function getPricing(): Promise<PricingData> {
  if (!pricingCache || Date.now() - pricingCache.fetchedAt > PRICING_TTL_MS) {
    pricingCache = await fetchPricing();
  }
  return pricingCache;
}

function getRatesForModel(pricing: PricingData, model: string | null): ModelRates {
  if (model) {
    // Exact match
    if (pricing.models[model]) return pricing.models[model];
    // Prefix match (e.g. "gpt-4o-realtime-preview-2024-12-17" → "gpt-4o-realtime-preview")
    for (const [key, rates] of Object.entries(pricing.models)) {
      if (model.startsWith(key)) return rates;
    }
  }
  // Fallback: first model in cache, or hardcoded
  return Object.values(pricing.models)[0] || FALLBACK_RATES;
}

function computeRawCost(
  rates: ModelRates,
  inputTokens: number,
  outputTokens: number,
  inputAudioTokens: number,
  outputAudioTokens: number,
): number {
  const textIn = inputTokens - inputAudioTokens;
  const textOut = outputTokens - outputAudioTokens;
  return (
    textIn * rates.textInput +
    textOut * rates.textOutput +
    inputAudioTokens * rates.audioInput +
    outputAudioTokens * rates.audioOutput
  ) / 1_000_000; // rates are per 1M tokens
}

// ============================================================
// API HELPERS — Communication avec Next.js
// ============================================================

async function fetchAiConfig(
  restaurantId: string,
  callerPhone = "",
): Promise<Record<string, any>> {
  const params = new URLSearchParams({ restaurantId });
  if (callerPhone) params.set("callerPhone", callerPhone);

  const resp = await fetch(`${NEXT_API_URL}/api/ai?${params}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error(`fetchAiConfig: ${resp.status}`);
  return resp.json();
}

async function apiGet(
  path: string,
  params?: Record<string, string>,
): Promise<Record<string, any>> {
  const qs = params ? `?${new URLSearchParams(params)}` : "";
  const resp = await fetch(`${NEXT_API_URL}${path}${qs}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error(`apiGet ${path}: ${resp.status}`);
  return resp.json();
}

async function apiPost(
  path: string,
  data: Record<string, any>,
): Promise<Record<string, any>> {
  const resp = await fetch(`${NEXT_API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error(`apiPost ${path}: ${resp.status}`);
  return resp.json();
}

async function apiPatch(
  path: string,
  data: Record<string, any>,
): Promise<Record<string, any>> {
  const resp = await fetch(`${NEXT_API_URL}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error(`apiPatch ${path}: ${resp.status}`);
  return resp.json();
}

async function checkPhoneBlocked(
  restaurantId: string,
  phone: string,
): Promise<boolean> {
  try {
    const data = await apiGet("/api/blocked-phones/check", {
      restaurantId,
      phone,
    });
    return data.blocked === true;
  } catch (e) {
    console.error(`Erreur verification blocage: ${e}`);
    return false; // En cas d'erreur, on ne bloque pas
  }
}

// ============================================================
// TOOL HANDLERS — Chaque function call d'OpenAI appelle l'API
// ============================================================

async function handleCheckAvailability(
  args: Record<string, any>,
  ctx: Ctx,
): Promise<Record<string, any>> {
  try {
    const payload: Record<string, any> = {
      restaurantId: ctx.restaurant_id,
      mode: args.mode || "pickup",
    };
    if (args.requested_time) payload.requestedTime = args.requested_time;
    if (args.customer_address) payload.customerAddress = args.customer_address;
    if (args.customer_city) payload.customerCity = args.customer_city;
    if (args.customer_postal_code)
      payload.customerPostalCode = args.customer_postal_code;
    if (args.party_size) payload.partySize = args.party_size;
    if (args.seating_preference)
      payload.seatingPreference = args.seating_preference;

    const result = await apiPost("/api/availability/check", payload);
    ctx.last_availability_check = result;
    return result;
  } catch (e) {
    console.error(`Erreur check_availability: ${e}`);
    return { available: false, error: String(e) };
  }
}

async function handleConfirmOrder(
  args: Record<string, any>,
  ctx: Ctx,
): Promise<Record<string, any>> {
  const availability = ctx.last_availability_check || {};
  const orderType = args.order_type || "pickup";

  // estimatedReadyAt depuis le dernier check_availability
  let estimatedReadyAt = availability.estimatedTimeISO;
  let heureStr = availability.estimatedTime || "";

  // Fallback si pas de check_availability (ne devrait pas arriver)
  if (!estimatedReadyAt) {
    const prepMin = ctx.avg_prep_time_min || 30;
    const readyDate = new Date(Date.now() + prepMin * 60_000);
    estimatedReadyAt = readyDate.toISOString();
    heureStr = formatParisTime(readyDate);
  }

  // Résoudre les id entiers → UUID via le itemMap
  const itemMap = ctx.item_map || {};
  const resolvedItems: Record<string, any>[] = [];

  for (const item of args.items || []) {
    const itemIdx = String(item.id ?? "");
    const entry = itemMap[itemIdx];
    const menuItemId = entry?.id ?? null;
    const itemName = entry?.name ?? `Item #${itemIdx}`;

    // Résoudre choice_id dans selected_options
    const resolvedOptions: Record<string, any>[] = [];
    for (const opt of item.selected_options || []) {
      if (opt.choice_id != null) {
        const choiceEntry = itemMap[String(opt.choice_id)];
        resolvedOptions.push({
          name: opt.name || "",
          choice: choiceEntry?.name ?? `#${opt.choice_id}`,
          extra_price: opt.extra_price || 0,
        });
      } else {
        resolvedOptions.push({
          name: opt.name || "",
          choice: opt.choice || "",
          extra_price: opt.extra_price || 0,
        });
      }
    }

    resolvedItems.push({
      menuItemId,
      name: itemName,
      quantity: item.quantity || 1,
      unitPrice: item.unit_price || 0,
      totalPrice: (item.unit_price || 0) * (item.quantity || 1),
      selectedOptions: resolvedOptions,
      notes: item.notes,
    });
  }

  const orderData: Record<string, any> = {
    restaurantId: ctx.restaurant_id,
    callId: ctx.call_id,
    customerId: ctx.customer_id,
    customerName: ctx.customer_name || null,
    customerPhone: ctx.caller_phone || "",
    total: args.total || 0,
    orderType,
    deliveryAddress:
      orderType === "delivery"
        ? availability.customerAddressFormatted
        : null,
    deliveryDistanceKm:
      orderType === "delivery" ? availability.deliveryDistanceKm : null,
    deliveryLat:
      orderType === "delivery" ? availability.customerLat : null,
    deliveryLng:
      orderType === "delivery" ? availability.customerLng : null,
    deliveryFee: args.delivery_fee || 0,
    estimatedReadyAt,
    notes: args.notes || "",
    paymentMethod: args.payment_method || "cash",
    items: resolvedItems,
  };

  try {
    const result = await apiPost("/api/orders", orderData);
    const orderId = result.id || "unknown";
    console.log(
      `Commande ${orderId} creee: ${args.total || 0}EUR, pret a ${heureStr}`,
    );
    const mode = orderType === "delivery" ? "livree" : "prete";
    return {
      success: true,
      order_id: orderId,
      message: `Commande de ${args.total || 0}EUR enregistree`,
      heure_estimee: heureStr,
      mode,
    };
  } catch (e) {
    console.error(`Erreur creation commande: ${e}`);
    return { success: false, error: String(e) };
  }
}

async function handleConfirmReservation(
  args: Record<string, any>,
  ctx: Ctx,
): Promise<Record<string, any>> {
  const availability = ctx.last_availability_check || {};

  let reservationTimeISO = availability.estimatedTimeISO;
  let heureStr =
    availability.estimatedTime || args.reservation_time || "";

  // Fallback : parser l'heure depuis les args si pas de check
  if (!reservationTimeISO && args.reservation_time) {
    try {
      const [h, m] = args.reservation_time.split(":").map(Number);
      const now = new Date();
      const resaTime = new Date(now);
      // Set hours in Paris timezone approximation
      resaTime.setHours(h, m, 0, 0);
      if (resaTime <= now) {
        resaTime.setDate(resaTime.getDate() + 1);
      }
      reservationTimeISO = resaTime.toISOString();
    } catch {
      reservationTimeISO = new Date().toISOString();
    }
  }

  const reservationData: Record<string, any> = {
    restaurantId: ctx.restaurant_id,
    callId: ctx.call_id,
    customerId: ctx.customer_id,
    customerName: args.customer_name || "",
    customerPhone: args.customer_phone || ctx.caller_phone || "",
    partySize: args.party_size || 2,
    reservationTime: reservationTimeISO,
    status: "confirmed",
    seatingPreference: args.seating_preference,
    notes: args.notes,
  };

  try {
    const result = await apiPost("/api/reservations", reservationData);
    const reservationId = result.id || "unknown";
    console.log(
      `Reservation ${reservationId} creee pour ${args.party_size || 2} pers a ${heureStr}`,
    );
    return {
      success: true,
      reservation_id: reservationId,
      message: `Table reservee pour ${args.party_size || 2} personnes a ${heureStr}`,
      heure: heureStr,
    };
  } catch (e) {
    console.error(`Erreur creation reservation: ${e}`);
    return { success: false, error: String(e) };
  }
}

async function handleSaveCustomer(
  args: Record<string, any>,
  ctx: Ctx,
): Promise<Record<string, any>> {
  const customerData: Record<string, any> = {
    restaurantId: ctx.restaurant_id,
    phone: ctx.caller_phone || "",
  };
  if (args.first_name) customerData.firstName = args.first_name;
  if (args.delivery_address)
    customerData.deliveryAddress = args.delivery_address;
  if (args.delivery_city) customerData.deliveryCity = args.delivery_city;
  if (args.delivery_postal_code)
    customerData.deliveryPostalCode = args.delivery_postal_code;
  if (args.delivery_notes) customerData.deliveryNotes = args.delivery_notes;

  try {
    const result = await apiPost("/api/customers", customerData);
    if (result.id) ctx.customer_id = result.id;
    if (args.first_name) ctx.customer_name = args.first_name;
    return { success: true, message: "Informations client enregistrees" };
  } catch (e) {
    console.error(`Erreur sauvegarde client: ${e}`);
    return { success: false, error: String(e) };
  }
}

async function handleLogFaq(
  args: Record<string, any>,
  ctx: Ctx,
): Promise<Record<string, any>> {
  try {
    await apiPost("/api/faq", {
      restaurantId: ctx.restaurant_id,
      question: args.question || "",
      category: args.category || "other",
      callerPhone: ctx.caller_phone || "",
    });
    return { success: true, message: "Question remontee au restaurateur" };
  } catch (e) {
    console.error(`Erreur log FAQ: ${e}`);
    return { success: true, message: "Question notee" };
  }
}

async function handleLeaveMessage(
  args: Record<string, any>,
  ctx: Ctx,
): Promise<Record<string, any>> {
  try {
    const messageData: Record<string, any> = {
      restaurantId: ctx.restaurant_id,
      callId: ctx.call_id,
      callerPhone: ctx.caller_phone || "",
      callerName: args.caller_name,
      content: args.content || "",
      category: args.category || "other",
      isUrgent: args.is_urgent || false,
    };
    const result = await apiPost("/api/messages", messageData);
    ctx.message_left = true;
    console.log(`Message cree: ${result.id || "unknown"}`);
    return { success: true, message: "Message transmis au restaurant" };
  } catch (e) {
    console.error(`Erreur creation message: ${e}`);
    return { success: true, message: "Message note" };
  }
}

async function handleCheckOrderStatus(
  args: Record<string, any>,
  ctx: Ctx,
): Promise<Record<string, any>> {
  const phone = args.customer_phone || ctx.caller_phone || "";
  try {
    return await apiGet("/api/orders/status", {
      restaurantId: ctx.restaurant_id,
      phone,
    });
  } catch (e) {
    console.error(`Erreur check_order_status: ${e}`);
    return {
      found: false,
      orders: [],
      error: "Impossible de verifier le statut",
    };
  }
}

async function handleCancelOrder(
  args: Record<string, any>,
  ctx: Ctx,
): Promise<Record<string, any>> {
  const orderNumber = args.order_number;
  if (!orderNumber) {
    return { success: false, error: "Numero de commande requis" };
  }

  try {
    const orders = await apiGet("/api/orders/status", {
      restaurantId: ctx.restaurant_id,
      phone: ctx.caller_phone || "",
    });

    let target: Record<string, any> | null = null;
    for (const o of orders.orders || []) {
      if (o.orderNumber === orderNumber) {
        target = o;
        break;
      }
    }

    if (!target) {
      return {
        success: false,
        error: `Commande #${orderNumber} introuvable`,
      };
    }

    if (!["pending", "confirmed"].includes(target.status)) {
      return {
        success: false,
        error: `Annulation impossible : la commande est deja en statut '${target.status}'`,
      };
    }

    await apiPatch("/api/orders", {
      id: target.id,
      status: "cancelled",
    });
    console.log(`Commande #${orderNumber} annulee`);
    return {
      success: true,
      message: `Commande #${orderNumber} annulee`,
    };
  } catch (e) {
    console.error(`Erreur cancel_order: ${e}`);
    return { success: false, error: "Erreur lors de l'annulation" };
  }
}

async function handleLookupReservation(
  args: Record<string, any>,
  ctx: Ctx,
): Promise<Record<string, any>> {
  const phone = args.customer_phone || ctx.caller_phone || "";
  try {
    return await apiGet("/api/reservations/lookup", {
      restaurantId: ctx.restaurant_id,
      phone,
    });
  } catch (e) {
    console.error(`Erreur lookup_reservation: ${e}`);
    return {
      found: false,
      reservations: [],
      error: "Impossible de chercher les reservations",
    };
  }
}

async function handleCancelReservation(
  args: Record<string, any>,
  ctx: Ctx,
): Promise<Record<string, any>> {
  const reservationId = args.reservation_id;
  if (!reservationId) {
    return { success: false, error: "ID de reservation requis" };
  }

  try {
    await apiPatch("/api/reservations", {
      id: reservationId,
      status: "cancelled",
    });
    console.log(`Reservation ${reservationId} annulee`);
    return { success: true, message: "Reservation annulee" };
  } catch (e) {
    console.error(`Erreur cancel_reservation: ${e}`);
    return { success: false, error: "Erreur lors de l'annulation" };
  }
}

async function handleTransferCall(
  args: Record<string, any>,
  ctx: Ctx,
): Promise<Record<string, any>> {
  const transferPhone = ctx.transfer_phone;
  if (!transferPhone) {
    return {
      success: false,
      error: "Pas de numero de transfert configure",
    };
  }

  const reason = args.reason || "Demande de l'IA";
  console.log(`Transfer initie: ${reason} → ${transferPhone}`);

  ctx.transferred = true;
  ctx.transfer_reason = reason;
  ctx.should_hangup = true;

  return {
    success: true,
    message: `Transfert en cours vers ${transferPhone}`,
  };
}

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  check_availability: handleCheckAvailability,
  confirm_order: handleConfirmOrder,
  confirm_reservation: handleConfirmReservation,
  save_customer_info: handleSaveCustomer,
  log_new_faq: handleLogFaq,
  leave_message: handleLeaveMessage,
  check_order_status: handleCheckOrderStatus,
  cancel_order: handleCancelOrder,
  lookup_reservation: handleLookupReservation,
  cancel_reservation: handleCancelReservation,
  transfer_call: handleTransferCall,
};

// ============================================================
// CALL LIFECYCLE — Création et finalisation du call record
// ============================================================

async function createCallRecord(ctx: Ctx): Promise<string | null> {
  try {
    const call = await apiPost("/api/calls", {
      restaurantId: ctx.restaurant_id,
      callerNumber: ctx.caller_phone || "",
      customerId: ctx.customer_id,
      startedAt: ctx.call_start.toISOString(),
    });
    const callId = call.id;
    console.log(`Call record cree: ${callId}`);
    return callId;
  } catch (e) {
    console.error(`Erreur creation call record: ${e}`);
    return null;
  }
}

async function finalizeCall(ctx: Ctx): Promise<void> {
  const callId = ctx.call_id;
  if (!callId) return;

  const now = new Date();
  const duration = Math.floor(
    (now.getTime() - ctx.call_start.getTime()) / 1000,
  );

  // Déterminer l'outcome
  let outcome = "abandoned";
  if (ctx.transferred) {
    outcome = "transferred";
  } else if (ctx.order_placed) {
    outcome = "order_placed";
  } else if (ctx.reservation_placed) {
    outcome = "reservation_placed";
  } else if (ctx.message_left) {
    outcome = "message_left";
  } else if (ctx.had_conversation) {
    outcome = "info_only";
  }

  // Auto-créer un message si conversation mais ni commande ni réservation ni message
  if (
    ctx.had_conversation &&
    !ctx.order_placed &&
    !ctx.reservation_placed &&
    !ctx.message_left
  ) {
    try {
      let transcriptSummary = "";
      for (const entry of (ctx.transcript || []).slice(-6)) {
        const role = entry.role === "user" ? "Client" : "IA";
        transcriptSummary += `${role}: ${entry.content.slice(0, 100)}\n`;
      }

      await apiPost("/api/messages", {
        restaurantId: ctx.restaurant_id,
        callId,
        callerPhone: ctx.caller_phone || "",
        content: `Appel sans commande ni reservation.\n\nDernieres echanges:\n${transcriptSummary.trim()}`,
        category: "info_request",
        isUrgent: false,
      });
      console.log(
        `Message auto-cree pour appel ${callId} sans commande/reservation`,
      );
    } catch (e) {
      console.error(`Erreur creation message auto: ${e}`);
    }
  }

  // 1. Calculer le coût IA brut en devise fournisseur (pricing.baseCurrency)
  const pricing = await getPricing();
  const providerCurrency = pricing.baseCurrency;
  const rates = getRatesForModel(pricing, ctx.ai_model);
  const rawAiCostProvider = computeRawCost(
    rates,
    ctx.input_tokens,
    ctx.output_tokens,
    ctx.input_audio_tokens,
    ctx.output_audio_tokens,
  );
  // 2. Appliquer la marge restaurant
  const costAiProvider = rawAiCostProvider * (1 + ctx.ai_cost_margin_pct / 100);

  // 3. Coût télécom en devise fournisseur (pas de marge)
  const costTelecomProvider = ctx.twilio_call_sid
    ? duration / 60 * pricing.telecomCostPerMin
    : 0;

  // 4. Convertir en devise de facturation (BILLING_CURRENCY) avec taux BCE
  const billingCurrency = process.env.NEXT_PUBLIC_BILLING_CURRENCY!;
  const fx = ctx.exchange_rate_to_local; // providerCurrency → billingCurrency
  const costAi = Math.round(costAiProvider * fx * 10000) / 10000;
  const costTelecom = Math.round(costTelecomProvider * fx * 10000) / 10000;

  const updates: Record<string, any> = {
    id: callId,
    endedAt: now.toISOString(),
    durationSec: duration,
    outcome,
    inputTokens: ctx.input_tokens,
    outputTokens: ctx.output_tokens,
    inputAudioTokens: ctx.input_audio_tokens,
    outputAudioTokens: ctx.output_audio_tokens,
    costAi,
    costTelecom,
    aiModel: ctx.ai_model,
    costCurrency: billingCurrency,
  };

  if (ctx.phone_line_id) {
    updates.phoneLineId = ctx.phone_line_id;
  }

  if (ctx.transcript?.length) {
    updates.transcript = ctx.transcript;
  }

  try {
    await apiPatch("/api/calls", updates);
    console.log(`Call ${callId} finalise (${duration}s, ${outcome}, tokens=${ctx.input_tokens + ctx.output_tokens}, cost_ai=${costAi.toFixed(4)}${billingCurrency} [brut=${costAiProvider.toFixed(4)}${providerCurrency}, marge=${ctx.ai_cost_margin_pct}%, fx=${fx}], cost_tel=${costTelecom.toFixed(4)}${billingCurrency}, provider=openai)`);
  } catch (e) {
    console.error(`Erreur finalisation call: ${e}`);
  }
}

// ============================================================
// FUNCTION CALL ROUTER
// ============================================================

async function handleFunctionCall(
  response: Record<string, any>,
  openaiWs: WebSocket,
  ctx: Ctx,
): Promise<void> {
  const functionName: string = response.name || "";
  const callId: string = response.call_id || "";

  let args: Record<string, any>;
  try {
    args = JSON.parse(response.arguments || "{}");
  } catch {
    args = {};
  }

  console.log(`Tool call: ${functionName}`);
  console.log(`Args: ${JSON.stringify(args, null, 2)}`);

  let result: Record<string, any>;

  // end_call — tool spécial géré inline (pas dans TOOL_HANDLERS)
  if (functionName === "end_call") {
    console.log("Tool end_call: l'IA demande à raccrocher");
    ctx.should_hangup = true;
    result = { status: "hanging_up" };
  } else {
    const handler = TOOL_HANDLERS[functionName];
    if (handler) {
      result = await handler(args, ctx);
      if (functionName === "confirm_order" && result.success) {
        ctx.order_placed = true;
      } else if (functionName === "confirm_reservation" && result.success) {
        ctx.reservation_placed = true;
      } else if (functionName === "leave_message" && result.success) {
        ctx.message_left = true;
      }
    } else {
      result = { error: `Fonction inconnue: ${functionName}` };
    }
  }

  // Répondre à OpenAI
  openaiWs.send(
    JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(result),
      },
    }),
  );

  // Ne PAS demander à l'IA de générer une réponse après end_call
  // (sinon elle dit "L'appel est maintenant terminé" de façon robotique)
  if (functionName !== "end_call") {
    openaiWs.send(JSON.stringify({ type: "response.create" }));
  }
}

// ============================================================
// TRANSFER — Exécution du transfert (Bridge SIP ou Twilio)
// ============================================================

async function executeTransfer(
  ctx: Ctx,
  twilioWs: WebSocket,
  streamSid: string,
): Promise<void> {
  const transferPhone = ctx.transfer_phone || "";
  const bridgeCallSid = ctx.bridge_call_sid;
  const twilioCallSid = ctx.twilio_call_sid;

  if (bridgeCallSid) {
    // Mode SIP Bridge : POST vers sipbridge /api/calls/{sid}/transfer
    const bridgePort = process.env.BRIDGE_PORT;
    if (bridgePort) {
      try {
        const sipDomain = process.env.SIP_DOMAIN || "sip.ovh.fr";
        const dest = `sip:${transferPhone}@${sipDomain}`;
        const postBody = JSON.stringify({ destination: dest });
        // Use http.request (fetch blocks port 5060 — SIP is a "bad port" in WHATWG spec)
        const data: any = await new Promise((resolve, reject) => {
          const req = http.request(
            `http://127.0.0.1:${bridgePort}/api/calls/${bridgeCallSid}/transfer`,
            { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(postBody).toString() }, timeout: 5000 },
            (res) => {
              let body = "";
              res.on("data", (chunk: Buffer) => (body += chunk));
              res.on("end", () => {
                if (res.statusCode && res.statusCode >= 400) reject(new Error(`SIP transfer HTTP ${res.statusCode}`));
                else { try { resolve(JSON.parse(body)); } catch { resolve(body); } }
              });
            },
          );
          req.on("error", reject);
          req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
          req.write(postBody);
          req.end();
        });
        console.log(`SIP transfer OK: ${JSON.stringify(data)}`);
      } catch (e) {
        console.error(`SIP transfer echoue: ${e}`);
      }
    } else {
      console.error("SIP transfer: BRIDGE_PORT non defini");
    }
  } else if (twilioCallSid) {
    // Mode Twilio : mettre à jour l'appel avec <Dial>
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      if (accountSid && authToken) {
        const twilioClient = twilio(accountSid, authToken);
        const twiml = `<Response><Dial>${transferPhone}</Dial></Response>`;
        await twilioClient.calls(twilioCallSid).update({ twiml });
        console.log(
          `Twilio transfer OK: ${twilioCallSid} → ${transferPhone}`,
        );
      } else {
        console.error(
          "Twilio transfer: TWILIO_ACCOUNT_SID/AUTH_TOKEN manquants",
        );
      }
    } catch (e) {
      console.error(`Twilio transfer echoue: ${e}`);
    }
  } else {
    console.error(
      "Transfer: ni bridge_call_sid ni twilio_call_sid disponible",
    );
  }
}

// ============================================================
// FASTIFY SERVER
// ============================================================

const server = Fastify({ logger: false });

await server.register(fastifyCors);
await server.register(fastifyWebsocket);

// GET / — Health check
server.get("/", async (_req, reply) => {
  reply.type("text/html").send(
    "<h1>Serveur vocal AlloResto</h1><p>Le serveur tourne. Configurez Twilio webhook vers /incoming-call</p>",
  );
});

// GET/POST /incoming-call — Twilio TwiML
server.route({
  method: ["GET", "POST"],
  url: "/incoming-call",
  handler: async (request, reply) => {
    let formData: Record<string, string> = {};

    if (request.method === "POST") {
      // Fastify body peut être un objet (JSON) ou un string (form-urlencoded)
      const body = request.body as Record<string, any> | string;
      if (typeof body === "string") {
        const params = new URLSearchParams(body);
        for (const [k, v] of params) formData[k] = v;
      } else if (body) {
        formData = body as Record<string, string>;
      }
    } else {
      formData = (request.query as Record<string, string>) || {};
    }

    const callerPhone = formData.From || "";
    const callSid = formData.CallSid || "";

    const response = new twilio.twiml.VoiceResponse();
    response.pause({ length: 1 });

    const host =
      (request.headers["host"] as string) || request.hostname;
    const connect = response.connect();
    const stream = connect.stream({ url: `wss://${host}/media-stream` });
    stream.parameter({ name: "callerPhone", value: callerPhone });
    stream.parameter({ name: "restaurantId", value: RESTAURANT_ID });
    stream.parameter({ name: "callSid", value: callSid });

    reply.type("application/xml").send(response.toString());
  },
});

// Pour parser les body form-urlencoded de Twilio
server.addContentTypeParser(
  "application/x-www-form-urlencoded",
  { parseAs: "string" },
  (_req, body, done) => {
    const parsed: Record<string, string> = {};
    const params = new URLSearchParams(body as string);
    for (const [k, v] of params) parsed[k] = v;
    done(null, parsed);
  },
);

// WebSocket /media-stream
server.register(async (app) => {
  app.get(
    "/media-stream",
    { websocket: true },
    (socket /* WebSocket */, _req) => {
      console.log("Nouvel appel connecte au WebSocket");

      // Contexte de l'appel
      const ctx: Ctx = {
        restaurant_id: RESTAURANT_ID,
        caller_phone: "",
        call_id: null,
        customer_id: null,
        customer_name: null,
        call_start: new Date(),
        order_placed: false,
        reservation_placed: false,
        message_left: false,
        had_conversation: false,
        transcript: [],
        avg_prep_time_min: 30,
        delivery_enabled: false,
        last_availability_check: null,
        should_hangup: false,
        transferred: false,
        transfer_phone: null,
        transfer_reason: null,
        twilio_call_sid: null,
        bridge_call_sid: null,
        item_map: {},
        phone_line_id: null,
        ai_cost_margin_pct: 30,
        currency: process.env.NEXT_PUBLIC_BILLING_CURRENCY!,
        exchange_rate_to_local: 1,
        ai_model: null,
        input_tokens: 0,
        output_tokens: 0,
        input_audio_tokens: 0,
        output_audio_tokens: 0,
      };

      let aiConfig: Record<string, any> | null = null;
      let streamSid: string | null = null;
      let latestMediaTimestamp = 0;
      let lastAssistantItem: string | null = null;
      const markQueue: string[] = [];
      let responseStartTimestampTwilio: number | null = null;
      let openaiWs: WebSocket | null = null;
      let finished = false;
      let pendingHangupResolve: (() => void) | null = null;
      let muteClient = false; // stop forwarding client audio after end_call

      // Connexion à OpenAI Realtime API
      const openaiWsUrl =
        "wss://api.openai.com/v1/realtime?model=gpt-realtime"; // gpt-4o-realtime-preview
      openaiWs = new WebSocket(openaiWsUrl, {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "OpenAI-Beta": "realtime=v1",
        },
      });

      // Promise résolue quand la connexion OpenAI est ouverte
      const openaiReady = new Promise<void>((resolve) => {
        openaiWs!.on("open", () => resolve());
        // Si déjà ouverte (peu probable mais par sécurité)
        if (openaiWs!.readyState === WebSocket.OPEN) resolve();
      });

      function cleanup() {
        if (finished) return;
        finished = true;
        try {
          if (
            openaiWs &&
            openaiWs.readyState !== WebSocket.CLOSED &&
            openaiWs.readyState !== WebSocket.CLOSING
          ) {
            openaiWs.close();
          }
        } catch {}
        try {
          if (
            socket.readyState !== WebSocket.CLOSED &&
            socket.readyState !== WebSocket.CLOSING
          ) {
            socket.close();
          }
        } catch {}
      }

      // Attendre que tous les marks soient acquittés (= audio joué côté Twilio/Bridge)
      function waitForMarksToComplete(): Promise<void> {
        if (markQueue.length === 0) {
          console.log(`[HANGUP] Pas de marks en attente — audio deja joue`);
          return Promise.resolve();
        }
        console.log(`[HANGUP] Attente fin playback (${markQueue.length} marks en attente)...`);
        return new Promise((resolve) => {
          pendingHangupResolve = resolve;
          // Timeout de sécurité si les marks ne reviennent jamais
          setTimeout(() => {
            if (pendingHangupResolve) {
              console.log(`[HANGUP] Timeout ${MARK_DRAIN_TIMEOUT_MS}ms — marks non acquittes (reste ${markQueue.length}), on raccroche quand meme`);
              pendingHangupResolve = null;
              resolve();
            }
          }, MARK_DRAIN_TIMEOUT_MS);
        });
      }

      function sendSessionUpdate() {
        if (!openaiWs || !aiConfig) return;

        const sessionUpdate = {
          type: "session.update",
          session: {
            turn_detection: {
              type: "server_vad",
              threshold: VAD_THRESHOLD,
              silence_duration_ms: VAD_SILENCE_MS,
              prefix_padding_ms: VAD_PREFIX_PADDING_MS,
            },
            input_audio_format: "g711_ulaw",
            output_audio_format: "g711_ulaw",
            voice: aiConfig.voice || "sage",
            instructions: aiConfig.systemPrompt,
            modalities: ["text", "audio"],
            temperature: 0.7,
            tools: aiConfig.tools,
            tool_choice: "auto",
            input_audio_transcription: { model: "whisper-1" },
          },
        };
        openaiWs.send(JSON.stringify(sessionUpdate));

        // Message d'accueil personnalisé
        const customer = aiConfig.customerContext;
        let greeting: string;
        if (customer?.firstName) {
          greeting =
            `Le client ${customer.firstName} vient d'appeler ` +
            `(client fidele, ${customer.totalOrders} commandes). ` +
            `Accueille-le par son prenom et demande ce qu'il souhaite commander.`;
        } else {
          greeting =
            "Un nouveau client vient d'appeler. " +
            "Accueille-le chaleureusement, presente-toi brievement " +
            "et demande ce qu'il souhaite commander.";
        }

        openaiWs.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [{ type: "input_text", text: greeting }],
            },
          }),
        );
        openaiWs.send(JSON.stringify({ type: "response.create" }));
      }

      // ------------------------------------------------
      // OpenAI WebSocket handlers (OpenAI → Twilio)
      // ------------------------------------------------
      openaiWs.on("open", () => {
        console.log("Connexion OpenAI Realtime ouverte");
      });

      openaiWs.on("message", async (data: WebSocket.Data) => {
        if (finished) return;

        try {
          const response = JSON.parse(data.toString());
          const responseType: string = response.type || "";

          if (LOG_EVENT_TYPES.includes(responseType)) {
            console.log(`OpenAI: ${responseType}`);
          }

          // Log détaillé des erreurs OpenAI
          if (responseType === "error") {
            const err = response.error || response;
            console.error(`OpenAI ERROR detail: type=${err.type || "?"}, code=${err.code || "?"}, message=${err.message || JSON.stringify(err)}`);
          }

          // Capture model ID from session.created
          if (responseType === "session.created") {
            const model = response.session?.model;
            if (model) {
              ctx.ai_model = model;
              console.log(`[SESSION] Model: ${model}`);
            }
          }

          // Token usage tracking — accumulate from each response.done
          if (responseType === "response.done") {
            const usage = response.response?.usage;
            if (usage) {
              ctx.input_tokens += usage.input_tokens || 0;
              ctx.output_tokens += usage.output_tokens || 0;
              ctx.input_audio_tokens += usage.input_token_details?.audio_tokens || 0;
              ctx.output_audio_tokens += usage.output_token_details?.audio_tokens || 0;
              console.log(`[TOKENS] +${usage.total_tokens || 0} (in=${usage.input_tokens || 0}, out=${usage.output_tokens || 0}, audio_in=${usage.input_token_details?.audio_tokens || 0}, audio_out=${usage.output_token_details?.audio_tokens || 0}) | cumul: in=${ctx.input_tokens} out=${ctx.output_tokens}`);
            }
          }

          // Audio delta → renvoyer à Twilio
          if (
            responseType === "response.audio.delta" &&
            response.delta
          ) {
            socket.send(
              JSON.stringify({
                event: "media",
                streamSid,
                media: { payload: response.delta },
              }),
            );
            if (responseStartTimestampTwilio === null) {
              responseStartTimestampTwilio = latestMediaTimestamp;
              console.log(`[TIMING] Audio response started at media_ts=${latestMediaTimestamp}ms`);
            }
          }

          // Transcript de la réponse IA (texte)
          if (responseType === "response.audio_transcript.done") {
            const text = response.transcript || "";
            if (text) {
              console.log(`[TRANSCRIPT] IA: ${text.slice(0, 120)}${text.length > 120 ? "..." : ""}`);
              ctx.had_conversation = true;
              ctx.transcript.push({
                role: "assistant",
                content: text,
                timestamp: nowISO(),
              });
            }
          }

          // Transcript de l'input utilisateur (Whisper)
          if (
            responseType ===
            "conversation.item.input_audio_transcription.completed"
          ) {
            const text = response.transcript || "";
            if (text) {
              console.log(`[TRANSCRIPT] Client: ${text.slice(0, 120)}${text.length > 120 ? "..." : ""}`);
              ctx.had_conversation = true;
              ctx.transcript.push({
                role: "user",
                content: text,
                timestamp: nowISO(),
              });
            }
          }

          // Interruption — le client parle pendant que l'IA répond
          // (ignoré après end_call pour ne pas couper l'audio de fin)
          if (responseType === "input_audio_buffer.speech_started" && !muteClient) {
            console.log("Client interrompt l'IA");
            if (
              markQueue.length &&
              responseStartTimestampTwilio !== null
            ) {
              const elapsed =
                latestMediaTimestamp - responseStartTimestampTwilio;
              socket.send(
                JSON.stringify({
                  event: "clear",
                  streamSid,
                }),
              );
              if (lastAssistantItem && openaiWs) {
                openaiWs.send(
                  JSON.stringify({
                    type: "conversation.item.truncate",
                    item_id: lastAssistantItem,
                    content_index: 0,
                    audio_end_ms: elapsed,
                  }),
                );
              }
              markQueue.length = 0;
            }
            responseStartTimestampTwilio = null;
          }

          // Track le dernier item assistant (pour les interruptions)
          if (responseType === "response.output_item.added") {
            const item = response.item || {};
            if (item.role === "assistant") {
              lastAssistantItem = item.id;
            }
          }

          // Function calling
          if (
            responseType ===
            "response.function_call_arguments.done"
          ) {
            const fnName = response.name || "";

            // end_call / transfer_call: couper micro + bloquer interruptions AVANT l'await
            // (sinon speech_started peut fire pendant handleFunctionCall et clear l'audio)
            if (fnName === "end_call" || fnName === "transfer_call") {
              muteClient = true;
              console.log(`[HANGUP] ${fnName} — micro client coupe, interruptions bloquees`);
            }

            await handleFunctionCall(response, openaiWs!, ctx);

            // end_call: attendre fin playback audio IA
            if (ctx.should_hangup && !ctx.transferred) {
              console.log(`[HANGUP] end_call — attente fin playback audio...`);
              await waitForMarksToComplete();
              await sleep(HANGUP_DELAY_S);
              console.log(`[HANGUP] Finalisation appel...`);
              await finalizeCall(ctx);
              console.log(`[HANGUP] Envoi event stop au stream ${streamSid}`);
              socket.send(
                JSON.stringify({
                  event: "stop",
                  streamSid,
                }),
              );
              console.log(`[HANGUP] Cleanup`);
              cleanup();
              return;
            }
          }

          // Marquer la fin d'un segment audio
          if (responseType === "response.audio.done") {
            const audioDuration = responseStartTimestampTwilio !== null
              ? latestMediaTimestamp - responseStartTimestampTwilio
              : 0;
            console.log(`[TIMING] Audio response done — duration=${audioDuration}ms, media_ts=${latestMediaTimestamp}ms, should_hangup=${ctx.should_hangup}`);

            socket.send(
              JSON.stringify({
                event: "mark",
                streamSid,
                mark: { name: "responsePart" },
              }),
            );
            markQueue.push("responsePart");
            responseStartTimestampTwilio = null;

            // Auto-hangup: déclenché par transfer_call (end_call passe par function_call_arguments.done)
            if (ctx.should_hangup) {
              if (ctx.transferred) {
                console.log(
                  `[HANGUP] Transfer vers ${ctx.transfer_phone} (raison: ${ctx.transfer_reason})`,
                );
                await waitForMarksToComplete();
                await executeTransfer(ctx, socket as any, streamSid!);
              }
              await sleep(HANGUP_DELAY_S);
              console.log(`[HANGUP] Finalisation appel...`);
              await finalizeCall(ctx);
              console.log(`[HANGUP] Envoi event stop au stream ${streamSid}`);
              socket.send(
                JSON.stringify({
                  event: "stop",
                  streamSid,
                }),
              );
              console.log(`[HANGUP] Cleanup`);
              cleanup();
              return;
            }
          }
        } catch (e) {
          console.error(`Erreur traitement message OpenAI: ${e}`);
        }
      });

      openaiWs.on("close", (code, reason) => {
        console.log(`[WS] OpenAI fermee code=${code} reason=${reason?.toString() || ""}`);
        if (!finished) {
          console.log("[WS] OpenAI close inattendu — finalisation...");
          finalizeCall(ctx).then(() => cleanup());
        }
      });

      openaiWs.on("error", (err) => {
        console.error(`[WS] OpenAI error: ${err.message || err}`);
      });

      // ------------------------------------------------
      // Twilio WebSocket handlers (Twilio → OpenAI)
      // ------------------------------------------------
      socket.on("message", async (data: WebSocket.Data) => {
        if (finished) return;

        try {
          const msg = JSON.parse(data.toString());

          if (
            msg.event === "media" &&
            openaiWs &&
            openaiWs.readyState === WebSocket.OPEN
          ) {
            latestMediaTimestamp = parseInt(
              msg.media.timestamp,
              10,
            );
            // Après end_call, ne plus envoyer l'audio client à OpenAI
            // pour éviter que le VAD relance une conversation
            if (!muteClient) {
              openaiWs.send(
                JSON.stringify({
                  type: "input_audio_buffer.append",
                  audio: msg.media.payload,
                }),
              );
            }
          } else if (msg.event === "start") {
            streamSid = msg.start.streamSid;
            console.log(`Stream demarre: ${streamSid}`);
            latestMediaTimestamp = 0;

            // Extraire les paramètres custom
            const customParams =
              msg.start.customParameters || {};
            const callerPhone =
              customParams.callerPhone || "";
            const restaurantId =
              customParams.restaurantId || RESTAURANT_ID;

            ctx.caller_phone = callerPhone;
            ctx.restaurant_id = restaurantId;

            // Capturer les SIDs pour le transfert
            const twilioSid = customParams.callSid || "";
            if (twilioSid) {
              ctx.twilio_call_sid = twilioSid;
            } else {
              ctx.bridge_call_sid = streamSid;
            }

            // 0. Vérifier si le numéro est bloqué
            if (
              callerPhone &&
              (await checkPhoneBlocked(
                restaurantId,
                callerPhone,
              ))
            ) {
              console.log(
                `Numero bloque: ${callerPhone} — raccrocher`,
              );
              cleanup();
              return;
            }

            // 1. Charger la config AI depuis l'API Next.js
            try {
              aiConfig = await fetchAiConfig(
                restaurantId,
                callerPhone,
              );
              console.log(
                `Config AI chargee pour restaurant ${restaurantId}`,
              );

              ctx.avg_prep_time_min =
                aiConfig.avgPrepTimeMin || 30;
              ctx.delivery_enabled =
                aiConfig.deliveryEnabled || false;
              ctx.item_map = aiConfig.itemMap || {};
              ctx.transfer_phone =
                aiConfig.transferPhoneNumber || null;
              ctx.ai_cost_margin_pct =
                aiConfig.aiCostMarginPct ?? 30;
              ctx.currency =
                aiConfig.currency;
              ctx.exchange_rate_to_local =
                aiConfig.exchangeRateToLocal ?? 1;

              const customer = aiConfig.customerContext;
              if (customer) {
                ctx.customer_id = customer.id || null;
                ctx.customer_name = customer.firstName || null;
              }
            } catch (e) {
              console.error(
                `Erreur chargement config AI: ${e}`,
              );
              aiConfig = {
                systemPrompt:
                  "Tu es un assistant vocal de restaurant. " +
                  "Le menu n'est pas disponible actuellement. " +
                  "Excuse-toi et demande au client de rappeler.",
                tools: [],
                voice: "sage",
                customerContext: null,
              };
            }

            // 2. Transfert automatique (bypass IA)
            if (
              aiConfig.transferAutomatic &&
              aiConfig.transferEnabled &&
              ctx.transfer_phone
            ) {
              console.log(
                `Transfert automatique vers ${ctx.transfer_phone}`,
              );
              ctx.transferred = true;
              ctx.transfer_reason = "Transfert automatique";
              ctx.call_id = await createCallRecord(ctx);
              await executeTransfer(
                ctx,
                socket as any,
                streamSid!,
              );
              await sleep(HANGUP_DELAY_S);
              await finalizeCall(ctx);
              socket.send(
                JSON.stringify({
                  event: "stop",
                  streamSid,
                }),
              );
              cleanup();
              return;
            }

            // 3. Attendre que OpenAI soit connecté, puis configurer la session
            await openaiReady;
            sendSessionUpdate();
            console.log("Session OpenAI configuree");

            // 4. Créer le call record
            ctx.call_id = await createCallRecord(ctx);
          } else if (msg.event === "mark") {
            if (markQueue.length) {
              markQueue.shift();
            }
            // Si on attend la fin du playback pour raccrocher
            if (pendingHangupResolve && markQueue.length === 0) {
              console.log(`[HANGUP] Tous les marks acquittes — audio termine`);
              const resolve = pendingHangupResolve;
              pendingHangupResolve = null;
              resolve();
            }
          } else if (msg.event === "stop") {
            const elapsed = Math.floor((Date.now() - ctx.call_start.getTime()) / 1000);
            console.log(`[STREAM] Stop recu (Twilio/Bridge) apres ${elapsed}s — finalisation...`);
            await finalizeCall(ctx);
            cleanup();
          }
        } catch (e) {
          console.error(
            `Erreur traitement message Twilio: ${e}`,
          );
        }
      });

      socket.on("close", (code, reason) => {
        const elapsed = Math.floor((Date.now() - ctx.call_start.getTime()) / 1000);
        console.log(`[WS] Client/Bridge deconnecte code=${code} apres ${elapsed}s`);
        if (!finished) {
          console.log("[WS] Deconnexion inattendue — finalisation...");
          finalizeCall(ctx).then(() => cleanup());
        }
      });

      socket.on("error", (err) => {
        console.error(`Erreur Twilio WebSocket: ${err}`);
      });

      // Watchdog durée max d'appel
      if (MAX_CALL_DURATION > 0) {
        setTimeout(async () => {
          if (finished) return;
          console.warn(
            `Durée max atteinte (${MAX_CALL_DURATION}s), fermeture de l'appel`,
          );
          await finalizeCall(ctx);
          cleanup();
        }, MAX_CALL_DURATION * 1000);
      }
    },
  );
});

// ============================================================
// ENTRY POINT
// ============================================================

if (!OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY manquant dans .env");
}
if (!RESTAURANT_ID) {
  throw new Error("RESTAURANT_ID manquant dans .env");
}

console.log(`Serveur vocal AlloResto demarre sur le port ${PORT}`);
console.log(`API Next.js: ${NEXT_API_URL}`);
console.log(`Restaurant: ${RESTAURANT_ID}`);
console.log(`Webhook Twilio: http://0.0.0.0:${PORT}/incoming-call`);

server.listen({ port: PORT, host: "0.0.0.0" });
