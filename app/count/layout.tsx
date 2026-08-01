import { OrganizationAuthGate } from "@/components/catalog/organization-auth-gate";
import { CountHeader } from "@/components/count/count-header";

export default function CountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto flex w-full max-w-[96rem] flex-col gap-4">
      <OrganizationAuthGate>
        <CountHeader />
        {children}
      </OrganizationAuthGate>
    </section>
  );
}
