import { FeatureToggle } from "@/components/organization/feature-toggle";
import { ScheduleSettings } from "@/components/organization/schedule-settings";

export default function AdministrationSchedulePage() {
  return (
    <div className="flex flex-col gap-6">
      <FeatureToggle feature="employees" />
      <ScheduleSettings />
    </div>
  );
}
