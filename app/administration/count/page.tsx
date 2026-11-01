import { FeatureToggle } from "@/components/organization/feature-toggle";
import { CountSettings } from "@/components/organization/count-settings";
import { ExtraCounts } from "@/components/organization/extra-counts";

export default function AdministrationCountPage() {
  return (
    <div className="flex flex-col gap-6">
      <FeatureToggle feature="count" />
      <ExtraCounts />
      <CountSettings />
    </div>
  );
}
