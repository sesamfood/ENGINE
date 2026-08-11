import { OrganizationAuthGate } from "@/components/catalog/organization-auth-gate";
import { CountHeader } from "@/components/count/count-header";
import { CountStateProvider } from "@/components/count/count-state-provider";

export default function CountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto flex w-full max-w-[96rem] flex-col gap-4">
      <OrganizationAuthGate>
        <CountStateProvider>
          <CountHeader />
          {children}
        </CountStateProvider>
      </OrganizationAuthGate>
    </section>
  );
}
