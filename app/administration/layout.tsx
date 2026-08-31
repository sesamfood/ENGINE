import { OrganizationAuthGate } from "@/components/catalog/organization-auth-gate";
import { AdministrationHeader } from "@/components/catalog/administration-nav";

export default function AdministrationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto flex w-full max-w-[96rem] flex-col gap-8">
      <AdministrationHeader />
      <OrganizationAuthGate>{children}</OrganizationAuthGate>
    </section>
  );
}
