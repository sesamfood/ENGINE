import { FeatureToggle } from "@/components/organization/feature-toggle";
import { InternalOrderSettings } from "@/components/organization/internal-order-settings";
import { OrderingSettings } from "@/components/organization/ordering-settings";
import { SupplierSettings } from "@/components/organization/supplier-settings";

export default function AdministrationOrderingPage() {
  return (
    <div className="flex flex-col gap-6">
      <FeatureToggle feature="ordering" />
      <OrderingSettings />
      <SupplierSettings />
      <InternalOrderSettings />
    </div>
  );
}
