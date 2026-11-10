// The 14 allergens that must be declared under EU regulation 1169/2011.
export const allergens = [
  { id: "gluten", label: "Gluten", color: "#F39C12" },
  { id: "crustaceans", label: "Krebsdyr", color: "#E74C3C" },
  { id: "eggs", label: "Æg", color: "#3FB6E8" },
  { id: "fish", label: "Fisk", color: "#EF5B5B" },
  { id: "peanuts", label: "Jordnødder", color: "#8B5A2B" },
  { id: "soy", label: "Soja", color: "#2E9E44" },
  { id: "milk", label: "Mælk", color: "#1FA3DD" },
  { id: "nuts", label: "Nødder", color: "#7B4B21" },
  { id: "celery", label: "Selleri", color: "#8BC34A" },
  { id: "mustard", label: "Sennep", color: "#E5B800" },
  { id: "sesame", label: "Sesam", color: "#C9A27A" },
  { id: "sulphites", label: "Svovldioxid og sulfitter", color: "#455A64" },
  { id: "lupin", label: "Lupin", color: "#8E44AD" },
  { id: "molluscs", label: "Bløddyr", color: "#EE6F6F" },
] as const;

export type AllergenId = (typeof allergens)[number]["id"];

export function sortAllergens(ids: Iterable<AllergenId>) {
  const set = new Set(ids);
  return allergens.filter((allergen) => set.has(allergen.id)).map((allergen) => allergen.id);
}
