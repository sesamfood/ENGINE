import { OwnCheckSettings } from "@/components/organization/own-check-settings";
import { OwnCheckTemplates } from "@/components/organization/own-check-templates";

export default function OrganizationOwnChecksPage() {
  return (
    <div className="flex flex-col gap-6">
      <OwnCheckSettings />
      <OwnCheckTemplates />
    </div>
  );
}
