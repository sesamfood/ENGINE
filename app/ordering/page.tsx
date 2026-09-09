import { OrganizationAuthGate } from "@/components/catalog/organization-auth-gate";
import { OrderingPlanner } from "@/components/ordering/ordering-planner";

export default function OrderingPage() {
  return (
    <section className="mx-auto flex w-full max-w-[96rem] flex-col gap-4">
      <OrganizationAuthGate>
        <OrderingPlanner />
      </OrganizationAuthGate>
    </section>
  );
}
