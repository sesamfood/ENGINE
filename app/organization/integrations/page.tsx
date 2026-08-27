import { OnlinePosIntegration } from "@/components/organization/online-pos-integration";
import { WoltIntegration } from "@/components/organization/wolt-integration";
import { WorkfeedIntegration } from "@/components/organization/workfeed-integration";

export default function OrganizationIntegrationsPage() {
  return (
    <div className="flex flex-col gap-5 pb-10">
      <WorkfeedIntegration />
      <OnlinePosIntegration />
      <WoltIntegration />
    </div>
  );
}
