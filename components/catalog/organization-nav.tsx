"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermission } from "@/components/app-shell";

const catalogSections = [
  { value: "products", label: "Produkter" },
  { value: "categories", label: "Kategorier" },
  { value: "units", label: "Enheder" },
];

const userSections = [
  { value: "users", label: "Brugere", permission: "members.manage" },
  { value: "users/roles", label: "Roller og adgang", permission: "roles.manage" },
] as const;

export function OrganizationHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const canManageMembers = usePermission("members.manage");
  const canManageRoles = usePermission("roles.manage");
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);
  const inCatalog = catalogSections.some((item) =>
    pathname.startsWith(`/organization/${item.value}`),
  );
  const inUsers = pathname.startsWith("/organization/users");
  const visibleUserSections = userSections.filter((item) =>
    item.permission === "members.manage" ? canManageMembers : canManageRoles,
  );
  const onProductForm = pathname.startsWith("/organization/products/");
  const catalogSection =
    catalogSections.find((item) =>
      pathname.startsWith(`/organization/${item.value}`),
    )?.value ?? "products";
  const title = inCatalog
    ? "Produkter"
    : pathname.startsWith("/organization/locations")
      ? "Lokationer"
        : pathname.startsWith("/organization/integrations")
          ? "Integrationer"
        : pathname.startsWith("/organization/metrics")
          ? "Målinger"
        : pathname.startsWith("/organization/schedule")
          ? "Vagtplan"
          : pathname.startsWith("/organization/staff-food")
            ? "Staff food"
          : pathname.startsWith("/organization/count")
            ? "Count"
            : pathname.startsWith("/organization/waste")
              ? "Waste"
              : pathname.startsWith("/organization/users/roles")
                ? "Roller og adgang"
                : pathname.startsWith("/organization/users")
                  ? "Brugere"
                : pathname.startsWith("/organization/sidebar")
                  ? "Sidemenu"
                : pathname.startsWith("/organization/feedback")
                  ? "Feedback"
                : pathname === "/organization"
                  ? "Settings"
                  : "Organisationens oplysninger";

  useEffect(() => {
    for (const item of catalogSections) {
      router.prefetch(`/organization/${item.value}`);
    }
    for (const item of userSections) {
      router.prefetch(`/organization/${item.value}`);
    }
  }, [router]);

  useEffect(() => {
    if (!inUsers) return;
    if (pathname.startsWith("/organization/users/roles") && !canManageRoles && canManageMembers) {
      router.replace("/organization/users", { scroll: false });
    } else if (!pathname.startsWith("/organization/users/roles") && !canManageMembers && canManageRoles) {
      router.replace("/organization/users/roles", { scroll: false });
    }
  }, [canManageMembers, canManageRoles, inUsers, pathname, router]);

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
      {inUsers && visibleUserSections.length ? (
        <Tabs
          value={pathname.startsWith("/organization/users/roles") ? "users/roles" : "users"}
          onValueChange={(value) => router.push(`/organization/${value}`, { scroll: false })}
        >
          <TabsList
            aria-label="Brugersektioner"
            className="h-14 w-full justify-start overflow-x-auto overflow-y-hidden"
          >
            {visibleUserSections.map((item) => (
              <TabsTrigger key={item.value} value={item.value} className="min-w-36 px-6">
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ) : null}
    </>
  );
}
