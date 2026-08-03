import { OrganizationAuthGate } from "@/components/catalog/organization-auth-gate";
import { WasteHeader } from "@/components/waste/waste-header";
import { WasteNavigation } from "@/components/waste/waste-navigation";

export default function WasteLayout({ children }: { children: React.ReactNode }) {
  return (
    <section className="mx-auto flex w-full max-w-[96rem] flex-col gap-6 pb-20">
      <OrganizationAuthGate>
        <WasteHeader>{children}</WasteHeader>
        <WasteNavigation />
      </OrganizationAuthGate>
    </section>
  );
}
