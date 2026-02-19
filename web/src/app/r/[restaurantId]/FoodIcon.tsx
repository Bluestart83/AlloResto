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
// Unicode-aware word boundaries : (?<!\p{L}) et (?!\p{L}) au lieu de \b
// car \b JS ne gère pas les accents (é, è, ê, ô, etc.)
// ---------------------------------------------------------------------------

function wordRegex(keywords: string[]): RegExp {
  const escaped = keywords.map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // [sx]? gère les pluraux français (crevette→crevettes, gâteau→gâteaux)
  return new RegExp(`(?<!\\p{L})(${escaped.join("|")})[sx]?(?!\\p{L})`, "iu");
}

const KEYWORD_MAP: [string, RegExp][] = [
  ["pizza", wordRegex(["pizza", "calzone"])],
  ["burger", wordRegex(["burger", "hamburger"])],
  ["pasta", wordRegex(["pâtes", "pates", "spaghetti", "tagliatelle", "penne", "lasagne", "ravioli", "gnocchi", "carbonara", "bolognaise", "linguine", "fusilli", "rigatoni"])],
  ["steak", wordRegex(["steak", "boeuf", "bœuf", "entrecôte", "entrecote", "bavette", "filet mignon", "côte de boeuf", "tartare", "carpaccio", "boeuf bourguignon"])],
  ["chicken", wordRegex(["poulet", "volaille", "dinde", "canard", "magret", "aiguillette", "escalope de poulet", "brochette de poulet"])],
  ["fish", wordRegex(["poisson", "saumon", "thon", "bar", "loup", "dorade", "cabillaud", "sole", "truite", "sardine", "anchois", "mérou"])],
  ["shrimp", wordRegex(["crevette", "gambas", "langoustine", "fruits de mer", "moules", "calamars", "poulpe", "homard", "crabe", "huître", "huitre", "saint-jacques"])],
  ["fries", wordRegex(["frites", "potatoes", "wedges"])],
  ["rice", wordRegex(["riz", "risotto", "paella", "riz cantonais"])],
  ["soup", wordRegex(["soupe", "velouté", "veloute", "bouillon", "minestrone", "gaspacho", "bisque", "consommé", "nouilles", "noodles", "ramen", "pho"])],
  ["salad", wordRegex(["salade", "mesclun", "roquette", "crudités", "crudites", "taboulé", "taboule", "coleslaw"])],
  ["egg", wordRegex(["omelette", "oeuf", "œuf", "quiche"])],
  ["fruit", wordRegex(["fruit", "pomme", "poire", "fraise", "framboise", "mangue", "ananas", "melon", "pastèque", "banane", "kiwi"])],
  ["dessert", wordRegex(["dessert", "gâteau", "gateau", "mousse", "crème brûlée", "creme brulee", "tarte", "fondant", "tiramisu", "panna cotta", "glace", "sorbet", "crêpe", "crepe", "brownie", "profiterole", "coulant", "île flottante", "mille-feuille", "macaron"])],
  ["cheese", wordRegex(["fromage", "camembert", "comté", "brie", "roquefort", "chèvre", "chevre", "mozzarella", "burrata", "plateau de fromages"])],
  ["bread", wordRegex(["pain", "sandwich", "panini", "bruschetta", "focaccia", "wrap", "croque", "bagel", "tartine"])],
  ["wine", wordRegex(["vin", "rosé", "champagne", "prosecco", "cuvée", "cuvee", "bouteille de vin"])],
  ["beer", wordRegex(["bière", "biere", "heineken", "peroni", "desperados", "pression", "blonde", "ambrée", "ambree", "stout", "ipa"])],
  ["hot-drink", wordRegex(["café", "cafe", "thé", "chocolat chaud", "cappuccino", "expresso", "espresso", "latte", "noisette", "infusion", "décaféiné"])],
  ["drink", wordRegex(["soda", "coca", "orangina", "jus", "limonade", "eau", "perrier", "san pellegrino", "schweppes", "sprite", "fanta", "ice tea", "sirop", "citronnade", "diabolo"])],
  ["spicy", wordRegex(["épicé", "epice", "piment", "piquant", "spicy", "chili", "harissa", "sriracha", "tandoori"])],
];

export function detectFoodIcon(
  itemName: string,
  categoryName?: string,
  isFormule?: boolean,
): string {
  if (isFormule) return "formule";
  const lower = itemName.toLowerCase();
  const catLower = categoryName?.toLowerCase() || "";
  for (const [icon, regex] of KEYWORD_MAP) {
    if (regex.test(lower) || regex.test(catLower)) return icon;
  }
  return "default";
}

export function FoodIcon({ name }: { name: string }) {
  const emoji = FOOD_EMOJI[name] || FOOD_EMOJI.default;
  return <span className="public-food-icon">{emoji}</span>;
}
