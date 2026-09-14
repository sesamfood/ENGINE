import { FeatureToggle } from "@/components/organization/feature-toggle";
import { CountSettings } from "@/components/organization/count-settings";

export default function AdministrationCountPage() {
  return (
    <div className="flex flex-col gap-6">
      <FeatureToggle feature="count" />
      <CountSettings />
    </div>
  );
}
