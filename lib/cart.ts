/** Simple aisle buckets for grocery MVP (keyword heuristics). */
const RULES: Array<{ aisle: string; keywords: RegExp }> = [
  { aisle: "Produce", keywords: /\b(lettuce|spinach|kale|broccoli|carrot|onion|garlic|tomato|pepper|apple|banana|berry|lemon|lime|avocado|potato|mushroom|herb|cilantro|parsley|ginger)\b/i },
  { aisle: "Dairy & eggs", keywords: /\b(milk|yogurt|cheese|butter|cream|egg)\b/i },
  { aisle: "Meat & seafood", keywords: /\b(chicken|beef|pork|turkey|salmon|fish|shrimp|tuna|steak|ground)\b/i },
  { aisle: "Bakery & grains", keywords: /\b(bread|tortilla|rice|pasta|oats|flour|quinoa|couscous)\b/i },
  { aisle: "Pantry", keywords: /\b(oil|vinegar|sauce|broth|stock|beans|lentil|nut|seed|honey|syrup|spice|salt|pepper)\b/i },
  { aisle: "Frozen", keywords: /\b(frozen|ice)\b/i },
];

export function aisleForIngredient(name: string): string {
  const n = name.trim();
  for (const r of RULES) {
    if (r.keywords.test(n)) return r.aisle;
  }
  return "General";
}

export function groupByAisle(items: string[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const raw of items) {
    const item = raw.trim();
    if (!item) continue;
    const aisle = aisleForIngredient(item);
    if (!map[aisle]) map[aisle] = [];
    if (!map[aisle].includes(item)) map[aisle].push(item);
  }
  return map;
}

export function buildSearchQuery(items: string[]): string {
  const unique = [...new Set(items.map((s) => s.trim()).filter(Boolean))];
  return unique.slice(0, 40).join(", ");
}

export function retailerUrls(query: string): { label: string; url: string }[] {
  const q = encodeURIComponent(query);
  return [
    { label: "Instacart search", url: `https://www.instacart.com/store/search?q=${q}` },
    { label: "Walmart search", url: `https://www.walmart.com/search?q=${q}` },
    { label: "Amazon search", url: `https://www.amazon.com/s?k=${q}` },
  ];
}
