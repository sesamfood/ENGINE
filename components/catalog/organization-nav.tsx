"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const catalogSections = [
  { value: "products", label: "Produkter" },
  { value: "categories", label: "Kategorier" },
  { value: "units", label: "Enheder" },
];

export function OrganizationHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const inCatalog = catalogSections.some((item) =>
    pathname.startsWith(`/organization/${item.value}`),
  );
  const onProductForm = pathname.startsWith("/organization/products/");
  const catalogSection =
    catalogSections.find((item) =>
      pathname.startsWith(`/organization/${item.value}`),
    )?.value ?? "products";
  const title = inCatalog
    ? "Produkter"
    : pathname.startsWith("/organization/locations")
      ? "Locations"
      : pathname.startsWith("/organization/integrations")
        ? "Integrationer"
        : pathname.startsWith("/organization/schedule")
          ? "Vagtplan"
          : pathname.startsWith("/organization/count")
            ? "Count"
            : pathname.startsWith("/organization/users")
              ? "Brugere"
              : pathname === "/organization"
                ? "Organisation"
                : "Organisationens oplysninger";

  useEffect(() => {
    for (const item of catalogSections) {
      router.prefetch(`/organization/${item.value}`);
    }
  }, [router]);

  if (onProductForm) return null;

  return (
    <>
      <header className="flex max-w-3xl flex-col gap-3">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">
          Administration
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h1>
      </header>

      {inCatalog ? (
        <Tabs
          value={catalogSection}
          onValueChange={(value) =>
            router.push(`/organization/${value}`, { scroll: false })
          }
        >
          <TabsList
            aria-label="Katalogsektioner"
            className="h-14 w-full justify-start overflow-x-auto overflow-y-hidden"
          >
            {catalogSections.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className="min-w-36 px-6"
              >
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ) : null}
    </>
  );
}
