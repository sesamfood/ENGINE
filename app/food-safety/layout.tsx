import { OrganizationAuthGate } from "@/components/catalog/organization-auth-gate";
import { FoodSafetyHeader } from "@/components/food-safety/food-safety-header";
import { FoodSafetyNavigation } from "@/components/food-safety/food-safety-navigation";

export default function FoodSafetyLayout({ children }: { children: React.ReactNode }) {
  return (
    <section className="mx-auto flex w-full max-w-(--container-page) flex-col gap-6">
      <OrganizationAuthGate>
        <FoodSafetyHeader />
        {children}
        <FoodSafetyNavigation />
      </OrganizationAuthGate>
    </section>
  );
}
