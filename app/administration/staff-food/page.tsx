import { FeatureToggle } from "@/components/organization/feature-toggle";
import { StaffFoodSettings } from "@/components/organization/staff-food-settings";

export default function AdministrationStaffFoodPage() {
  return (
    <div className="flex flex-col gap-6">
      <FeatureToggle feature="staffFood" />
      <StaffFoodSettings />
    </div>
  );
}
