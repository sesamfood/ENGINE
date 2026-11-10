// The 14 allergens that must be declared under EU regulation 1169/2011.
export const allergens = [
  { id: "gluten", label: "Gluten" },
  { id: "crustaceans", label: "Krebsdyr" },
  { id: "eggs", label: "Æg" },
  { id: "fish", label: "Fisk" },
  { id: "peanuts", label: "Jordnødder" },
  { id: "soy", label: "Soja" },
  { id: "milk", label: "Mælk" },
  { id: "nuts", label: "Nødder" },
  { id: "celery", label: "Selleri" },
  { id: "mustard", label: "Sennep" },
  { id: "sesame", label: "Sesam" },
  { id: "sulphites", label: "Svovldioxid og sulfitter" },
  { id: "lupin", label: "Lupin" },
  { id: "molluscs", label: "Bløddyr" },
] as const;

export type AllergenId = (typeof allergens)[number]["id"];

export function sortAllergens(ids: Iterable<AllergenId>) {
  const set = new Set(ids);
  return allergens.filter((allergen) => set.has(allergen.id)).map((allergen) => allergen.id);
}
