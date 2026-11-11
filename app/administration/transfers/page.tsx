import { FeatureToggle } from "@/components/organization/feature-toggle";
import { TransferSettings } from "@/components/organization/transfer-settings";

export default function AdministrationTransfersPage() {
  return (
    <div className="flex flex-col gap-6">
      <FeatureToggle feature="transfers" />
      <TransferSettings />
    </div>
  );
}
