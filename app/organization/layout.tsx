import { OrganizationAuthGate } from "@/components/catalog/organization-auth-gate";
import { OrganizationHeader } from "@/components/catalog/organization-nav";

export default function OrganizationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto flex w-full max-w-[96rem] flex-col gap-8">
      <OrganizationHeader />
      <OrganizationAuthGate>{children}</OrganizationAuthGate>
    </section>
  );
}
