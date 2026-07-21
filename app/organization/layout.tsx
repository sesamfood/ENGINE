import { OrganizationAuthGate } from "@/components/catalog/organization-auth-gate";
import { OrganizationNav } from "@/components/catalog/organization-nav";

export default function OrganizationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto flex w-full max-w-[96rem] flex-col gap-8">
      <header className="flex max-w-3xl flex-col gap-3">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">
          Organization
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Catalog management
        </h1>
        <p className="text-base leading-7 text-muted-foreground">
          Keep products, recipes, categories, and units consistent across every
          location.
        </p>
      </header>
      <OrganizationNav />
      <OrganizationAuthGate>{children}</OrganizationAuthGate>
    </section>
  );
}
