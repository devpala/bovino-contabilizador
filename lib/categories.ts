export type Category = {
  key: string;
  label: string;
  emoji: string;
};

export const CATEGORIES: Category[] = [
  { key: "vacas", label: "Vacas", emoji: "🐄" },
  { key: "toros", label: "Toros", emoji: "🐂" },
  { key: "novillitos", label: "Novillitos", emoji: "🐮" },
  { key: "vaquillonas", label: "Vaquillonas", emoji: "🐄" },
  { key: "terneras", label: "Terneras", emoji: "🐄" },
  { key: "terneros", label: "Terneros", emoji: "🐃" },
];

export function createDefaultValues() {
  return Object.fromEntries(
    CATEGORIES.map((category) => [category.key, 0]),
  ) as Record<string, number>;
}
