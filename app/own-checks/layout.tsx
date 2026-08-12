import { OrganizationAuthGate } from "@/components/catalog/organization-auth-gate";
import { OwnChecksHeader } from "@/components/own-checks/own-checks-header";
import { OwnChecksNavigation } from "@/components/own-checks/own-checks-navigation";

export default function OwnChecksLayout({ children }: { children: React.ReactNode }) {
  return (
    <section className="mx-auto flex w-full max-w-[96rem] flex-col gap-6 pb-20">
      <OrganizationAuthGate>
        <OwnChecksHeader />
        {children}
        <OwnChecksNavigation />
      </OrganizationAuthGate>
    </section>
  );
}
