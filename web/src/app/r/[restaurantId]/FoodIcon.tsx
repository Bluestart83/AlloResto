"use client";

// ---------------------------------------------------------------------------
// Food icons — emoji natifs, fun et colorés
// ---------------------------------------------------------------------------

const FOOD_EMOJI: Record<string, string> = {
  pizza: "🍕",
  burger: "🍔",
  pasta: "🍝",
  steak: "🥩",
  chicken: "🍗",
  fish: "🐟",
  shrimp: "🍤",
  fries: "🍟",
  rice: "🍚",
  soup: "🍜",
  salad: "🥗",
  egg: "🍳",
  fruit: "🍎",
  dessert: "🍰",
  cheese: "🧀",
  bread: "🥖",
  spicy: "🌶️",
  drink: "🥤",
  "hot-drink": "☕",
  wine: "🍷",
  beer: "🍺",
  formule: "🍽️",
  offer: "🏷️",
  default: "🍴",
};

// ---------------------------------------------------------------------------
// Keyword → icon auto-detection
// ---------------------------------------------------------------------------

const KEYWORD_MAP: [string, string[]][] = [
  ["pizza", ["pizza", "calzone"]],
  ["burger", ["burger", "hamburger"]],
  ["pasta", ["pâtes", "pates", "spaghetti", "tagliatelle", "penne", "lasagne", "ravioli", "gnocchi", "carbonara", "bolognaise", "linguine", "fusilli", "rigatoni"]],
  ["steak", ["steak", "boeuf", "bœuf", "entrecôte", "entrecote", "bavette", "filet mignon", "côte de boeuf", "tartare", "carpaccio", "boeuf bourguignon"]],
  ["chicken", ["poulet", "volaille", "dinde", "canard", "magret", "aiguillette", "escalope de poulet", "brochette de poulet"]],
  ["fish", ["poisson", "saumon", "thon", "bar", "loup", "dorade", "cabillaud", "sole", "truite", "sardine", "anchois", "mérou"]],
  ["shrimp", ["crevette", "gambas", "langoustine", "fruits de mer", "moules", "calamars", "poulpe", "homard", "crabe", "huître", "huitre", "saint-jacques"]],
  ["fries", ["frites", "potatoes", "wedges"]],
  ["rice", ["riz", "risotto", "paella", "riz cantonais"]],
  ["soup", ["soupe", "velouté", "veloute", "bouillon", "minestrone", "gaspacho", "bisque", "consommé"]],
  ["salad", ["salade", "mesclun", "roquette", "crudités", "crudites", "taboulé", "taboule", "coleslaw"]],
  ["egg", ["omelette", "oeuf", "œuf", "quiche"]],
  ["fruit", ["fruit", "pomme", "poire", "fraise", "framboise", "mangue", "ananas", "melon", "pastèque", "banane", "kiwi"]],
  ["dessert", ["dessert", "gâteau", "gateau", "mousse", "crème brûlée", "creme brulee", "tarte", "fondant", "tiramisu", "panna cotta", "glace", "sorbet", "crêpe", "crepe", "brownie", "profiterole", "coulant", "île flottante", "mille-feuille", "macaron"]],
  ["cheese", ["fromage", "camembert", "comté", "brie", "roquefort", "chèvre", "chevre", "mozzarella", "burrata", "plateau de fromages"]],
  ["bread", ["pain", "sandwich", "panini", "bruschetta", "focaccia", "wrap", "croque", "bagel", "tartine"]],
  ["wine", ["vin ", "rosé", "champagne", "prosecco", "cuvée", "cuvee", "bouteille de vin"]],
  ["beer", ["bière", "biere", "heineken", "peroni", "desperados", "pression", "blonde", "ambrée", "ambree", "stout", "ipa"]],
  ["hot-drink", ["café", "cafe", "thé", " the ", "chocolat chaud", "cappuccino", "expresso", "espresso", "latte", "noisette", "infusion", "décaféiné"]],
  ["drink", ["soda", "coca", "orangina", "jus", "limonade", "eau ", "perrier", "san pellegrino", "schweppes", "sprite", "fanta", "ice tea", "sirop", "citronnade", "diabolo"]],
  ["spicy", ["épicé", "epice", "piment", "piquant", "spicy", "chili", "harissa", "sriracha", "tandoori"]],
];

export function detectFoodIcon(
  itemName: string,
  categoryName?: string,
  isFormule?: boolean,
): string {
  if (isFormule) return "formule";
  const lower = ` ${itemName.toLowerCase()} `;
  const catLower = categoryName ? ` ${categoryName.toLowerCase()} ` : "";
  for (const [icon, keywords] of KEYWORD_MAP) {
    for (const kw of keywords) {
      if (lower.includes(kw) || catLower.includes(kw)) return icon;
    }
  }
  return "default";
}

export function FoodIcon({ name }: { name: string }) {
  const emoji = FOOD_EMOJI[name] || FOOD_EMOJI.default;
  return <span className="public-food-icon">{emoji}</span>;
}
