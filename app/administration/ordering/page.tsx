import { FeatureToggle } from "@/components/organization/feature-toggle";
import { OrderingSettings } from "@/components/organization/ordering-settings";

export default function AdministrationOrderingPage() {
  return (
    <div className="flex flex-col gap-6">
      <FeatureToggle feature="ordering" />
      <OrderingSettings />
    </div>
  );
}
