import { FeatureToggle } from "@/components/organization/feature-toggle";
import { DateLabelSettings } from "@/components/organization/date-label-settings";

export default function AdministrationDateLabelsPage() {
  return (
    <div className="flex flex-col gap-6">
      <FeatureToggle feature="dateLabels" />
      <DateLabelSettings />
    </div>
  );
}
