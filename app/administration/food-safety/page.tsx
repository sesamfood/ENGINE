import { FeatureToggle } from "@/components/organization/feature-toggle";
import { FoodSafetySettings } from "@/components/organization/food-safety-settings";
import { FoodSafetyTemplates } from "@/components/organization/food-safety-templates";

export default function AdministrationFoodSafetyPage() {
  return (
    <div className="flex flex-col gap-6">
      <FeatureToggle feature="foodSafety" />
      <FoodSafetySettings />
      <FoodSafetyTemplates />
    </div>
  );
}
