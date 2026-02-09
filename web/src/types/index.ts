// ============================================================
// Types partagés — VoiceOrder AI
// ============================================================

export type CallOutcome = "in_progress" | "order_placed" | "abandoned" | "info_only" | "error";
export type OrderStatus = "pending" | "confirmed" | "preparing" | "ready" | "delivering" | "completed" | "cancelled";
export type OrderType = "pickup" | "delivery";
export type PaymentMethod = "cash" | "card" | "online";
export type FaqStatus = "pending" | "answered" | "ignored";
export type FaqCategory = "horaires" | "livraison" | "allergens" | "paiement" | "parking" | "reservation" | "promotion" | "ingredients" | "other";

export type CuisineType =
  // Européen
  | "pizza" | "italien" | "francais" | "creperie" | "burger" | "bistrot"
  | "brasserie" | "gastronomique" | "savoyard" | "alsacien" | "basque"
  | "espagnol" | "tapas" | "portugais" | "grec"
  // Asiatique
  | "chinois" | "japonais" | "sushi" | "ramen" | "thai" | "vietnamien"
  | "pho" | "coreen" | "bbq_coreen" | "indien" | "pakistanais"
  | "sri_lankais" | "bangladeshi" | "cambodgien" | "indonesien"
  | "malaisien" | "philippin" | "tibetain" | "wok"
  // Moyen-Orient / Méditerranéen
  | "kebab" | "turc" | "libanais" | "syrien" | "marocain" | "tunisien"
  | "algerien" | "egyptien" | "iranien" | "israelien" | "falafel"
  // Afrique / Îles
  | "africain" | "senegalais" | "ethiopien" | "malgache" | "reunion"
  | "antillais" | "creole"
  // Amérique
  | "mexicain" | "tex_mex" | "bresilien" | "peruvien" | "colombien"
  | "americain" | "bbq" | "cajun" | "canadien"
  // Fast food / Snack
  | "fast_food" | "sandwich" | "bagel" | "wrap" | "poke_bowl"
  | "salade" | "healthy" | "vegan" | "vegetarien"
  // Sucré
  | "patisserie" | "boulangerie" | "glace" | "crepe_sucree"
  | "donut" | "bubble_tea"
  // Fruits de mer
  | "poisson" | "fruits_de_mer" | "sushi_bar" | "poke"
  // Autre
  | "traiteur" | "buffet" | "food_truck" | "other";

// ---- API Responses ----

export interface DashboardStats {
  totalCalls: number;
  totalOrders: number;
  totalRevenue: number;
  conversionRate: number;
  avgCallDuration: number;
  avgDistance: number;
  maxConcurrent: number;
  timeSavedPercent: number;
  costToday: number;
  costWeekEstimate: number;
  costMonthEstimate: number;
}

export interface HourlyStats {
  hour: number;
  calls: number;
  concurrent: number;
}

export interface WeeklyStats {
  day: string;
  calls: number;
  orders: number;
  revenue: number;
  cost: number;
}

export interface DistanceStats {
  range: string;
  count: number;
  pct: number;
}

export interface OutcomeStats {
  name: string;
  value: number;
  color: string;
}

export interface RecentCall {
  id: string;
  callerNumber: string;
  customerName: string | null;
  duration: number;
  outcome: CallOutcome;
  total: number;
  orderType: OrderType | null;
  distance: number | null;
  time: string;
}

export interface TopCustomer {
  name: string;
  phone: string;
  orders: number;
  spent: number;
  lastOrder: string;
}

// ---- Pricing ----

export interface PricingConfig {
  monthlyCost: number;
  perMinute: number;
  currency: string;
}

// ---- Import ----

export interface ImportSearchResult {
  place_id: string;
  name: string;
  address: string;
}

export interface MenuOptionChoice {
  label: string;
  price_modifier: number;
}

export interface MenuOption {
  name: string;
  type: "single_choice" | "multi_choice";
  required: boolean;
  max_choices?: number;
  choices: MenuOptionChoice[];
}

export interface MenuItemImport {
  ref: string;
  category_ref: string;
  name: string;
  description: string | null;
  price: number;
  allergens: string[];
  tags: string[];
  available: boolean;
  options: MenuOption[];
}

export interface MenuCategoryImport {
  ref: string;
  name: string;
  description?: string;
  display_order: number;
}

export interface DayHours {
  open: string;
  close: string;
  open2?: string;
  close2?: string;
}
