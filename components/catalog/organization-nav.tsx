"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const catalogSections = [
  { value: "products", label: "Produkter" },
  { value: "categories", label: "Kategorier" },
  { value: "units", label: "Enheder" },
];

export function OrganizationHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);
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
          : pathname.startsWith("/organization/staff-food")
            ? "Staff food"
          : pathname.startsWith("/organization/count")
            ? "Count"
            : pathname.startsWith("/organization/waste")
              ? "Waste"
              : pathname.startsWith("/organization/users")
                ? "Brugere"
                : pathname.startsWith("/organization/sidebar")
                  ? "Sidemenu"
                : pathname === "/organization"
                  ? "Organisation"
                  : "Organisationens oplysninger";

  useEffect(() => {
    for (const item of catalogSections) {
      router.prefetch(`/organization/${item.value}`);
    }
  }, [router]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setHeaderTarget(document.getElementById("organization-shell-header"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (onProductForm) return null;

  const header = (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">
        Administration
      </p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h1>
    </div>
  );

  return (
    <>
      <header className="md:hidden">{header}</header>
      {headerTarget ? createPortal(header, headerTarget) : null}

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
