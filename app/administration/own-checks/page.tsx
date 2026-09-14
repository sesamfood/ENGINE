import { FeatureToggle } from "@/components/organization/feature-toggle";
import { OwnCheckSettings } from "@/components/organization/own-check-settings";
import { OwnCheckTemplates } from "@/components/organization/own-check-templates";

export default function AdministrationOwnChecksPage() {
  return (
    <div className="flex flex-col gap-6">
      <FeatureToggle feature="ownChecks" />
      <OwnCheckSettings />
      <OwnCheckTemplates />
    </div>
  );
}
