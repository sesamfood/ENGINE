"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermission } from "@/components/app-shell";

const administrationPath = "/administration";

type CatalogSection = {
  value: string;
  label: string;
  permission?: "integrations.manage";
};

const catalogSections: CatalogSection[] = [
  { value: "products", label: "Produkter" },
  { value: "menus", label: "Menuer", permission: "integrations.manage" },
  { value: "categories", label: "Kategorier" },
  { value: "units", label: "Enheder" },
];

const userSections = [
  { value: "users", label: "Brugere", permission: "members.manage" },
  { value: "users/roles", label: "Roller og adgang", permission: "roles.manage" },
];

const sectionTitles = [
  { value: "users/roles", label: "Roller og adgang" },
  { value: "users", label: "Brugere" },
  { value: "locations", label: "Lokationer" },
  { value: "integrations", label: "Integrationer" },
  { value: "metrics", label: "Målinger" },
  { value: "schedule", label: "Vagtplan" },
  { value: "staff-food", label: "Staff food" },
  { value: "own-checks", label: "Egenkontrol" },
  { value: "count", label: "Count" },
  { value: "goods-receipts", label: "Varemodtagelse" },
  { value: "waste", label: "Waste" },
  { value: "kiosk", label: "Kiosk" },
  { value: "sidebar", label: "Sidemenu" },
  { value: "feedback", label: "Feedback" },
  { value: "appearance", label: "Udseende" },
  { value: "api", label: "API" },
];

export function AdministrationHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const canManageMembers = usePermission("members.manage");
  const canManageRoles = usePermission("roles.manage");
  const canManageApiKeys = usePermission("apiKeys.manage");
  const canManageIntegrations = usePermission("integrations.manage");
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);
  const inCatalog = catalogSections.some((item) =>
    pathname.startsWith(`${administrationPath}/${item.value}`),
  );
  const inUsers = pathname.startsWith(`${administrationPath}/users`);
  const visibleUserSections = userSections.filter((item) =>
    item.permission === "members.manage" ? canManageMembers : canManageRoles,
  );
  const onProductForm = pathname.startsWith(`${administrationPath}/products/`);
  const catalogSection =
    catalogSections.find((item) =>
      pathname.startsWith(`${administrationPath}/${item.value}`),
    )?.value ?? "products";
  const visibleCatalogSections = catalogSections.filter(
    (item) =>
      item.permission !== "integrations.manage" || canManageIntegrations,
  );
  const activeCatalogSection = visibleCatalogSections.some(
    (item) => item.value === catalogSection,
  )
    ? catalogSection
    : "products";
  const title = inCatalog
    ? "Produkter"
    : pathname === administrationPath
      ? "Administration"
      : sectionTitles.find((item) =>
          pathname.startsWith(`${administrationPath}/${item.value}`),
        )?.label ?? "Administration";

  useEffect(() => {
    for (const item of catalogSections) {
      if (item.permission === "integrations.manage" && !canManageIntegrations) {
        continue;
      }
      router.prefetch(`${administrationPath}/${item.value}`);
    }
    for (const item of userSections) {
      router.prefetch(`${administrationPath}/${item.value}`);
    }
    if (canManageApiKeys) router.prefetch(`${administrationPath}/api`);
  }, [canManageApiKeys, canManageIntegrations, router]);

  useEffect(() => {
    if (!inUsers) return;
    if (
      pathname.startsWith(`${administrationPath}/users/roles`) &&
      !canManageRoles &&
      canManageMembers
    ) {
      router.replace(`${administrationPath}/users`, { scroll: false });
    } else if (
      !pathname.startsWith(`${administrationPath}/users/roles`) &&
      !canManageMembers &&
      canManageRoles
    ) {
      router.replace(`${administrationPath}/users/roles`, { scroll: false });
    }
  }, [canManageMembers, canManageRoles, inUsers, pathname, router]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setHeaderTarget(document.getElementById("administration-shell-header"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (onProductForm) return null;

  const header = (
    <div className="flex min-w-0 flex-col gap-2">
      {pathname === administrationPath ? null : (
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">
          Administration
        </p>
      )}
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
          value={activeCatalogSection}
          onValueChange={(value) =>
            router.push(`${administrationPath}/${value}`, { scroll: false })
          }
        >
          <TabsList
            aria-label="Katalogsektioner"
            className="h-14 w-full justify-start overflow-x-auto overflow-y-hidden"
          >
            {visibleCatalogSections.map((item) => (
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
      {inUsers && visibleUserSections.length > 1 ? (
        <Tabs
          value={
            pathname.startsWith(`${administrationPath}/users/roles`)
              ? "users/roles"
              : "users"
          }
          onValueChange={(value) =>
            router.push(`${administrationPath}/${value}`, { scroll: false })
          }
        >
          <TabsList
            aria-label="Brugersektioner"
            className="h-14 w-full justify-start overflow-x-auto overflow-y-hidden"
          >
            {visibleUserSections.map((item) => (
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
