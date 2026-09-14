import { FeatureToggle } from "@/components/organization/feature-toggle";
import { WasteSettings } from "@/components/organization/waste-settings";

export default function AdministrationWastePage() {
  return (
    <div className="flex flex-col gap-6">
      <FeatureToggle feature="waste" />
      <WasteSettings />
    </div>
  );
}
