import { allergenIconPaths } from "@/lib/allergen-icons";
import { allergens, type AllergenId } from "@/lib/allergens";

// Pictograms keep their fixed colors in every theme, like printed allergen labels.
const GLYPH = "#FFFFFF";
const colors = new Map<AllergenId, string>(allergens.map((allergen) => [allergen.id, allergen.color]));

export function AllergenIcon({ allergen, className }: { allergen: AllergenId; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <circle cx="32" cy="32" r="32" fill={colors.get(allergen)} />
      <circle cx="32" cy="32" r="28.5" fill="none" stroke={GLYPH} strokeWidth="1.5" />
      <g fill={GLYPH} transform="translate(11 11) scale(0.656)">
        {allergenIconPaths[allergen].map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  );
}
