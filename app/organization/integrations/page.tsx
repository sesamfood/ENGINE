import { OnlinePosIntegration } from "@/components/organization/online-pos-integration";
import { WorkfeedIntegration } from "@/components/organization/workfeed-integration";

export default function OrganizationIntegrationsPage() {
  return (
    <div className="flex flex-col gap-5">
      <WorkfeedIntegration />
      <OnlinePosIntegration />
    </div>
  );
}
