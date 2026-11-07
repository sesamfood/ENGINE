"use client";

import { useIntegrations } from "@/integrations/use-integrations";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  BookOpenIcon,
  ContainerIcon,
  LayoutGridIcon,
  PackageIcon,
  RulerIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react";
import { AppBottomBar } from "@/components/app-bottom-bar";
import { AppPageHeader, PageTitle } from "@/components/app-page-header";
import { SectionNav, type SectionNavItem } from "@/components/section-nav";
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
  { value: "containers", label: "Beholdere" },
];

const catalogIcons: Record<string, SectionNavItem["icon"]> = {
  products: PackageIcon,
  menus: BookOpenIcon,
  categories: LayoutGridIcon,
  units: RulerIcon,
  containers: ContainerIcon,
};

const userSections = [
  { value: "users", label: "Brugere", permission: "members.manage", icon: UsersIcon },
  {
    value: "users/roles",
    label: "Roller og adgang",
    permission: "roles.manage",
    icon: ShieldCheckIcon,
  },
];

const sectionTitles = [
  { value: "users/roles", label: "Roller og adgang" },
  { value: "users", label: "Brugere" },
  { value: "locations", label: "Lokationer" },
  { value: "integrations", label: "Integrationer" },
  { value: "metrics", label: "Målinger" },
  { value: "dashboard", label: "Dashboard" },
  { value: "schedule", label: "Medarbejdere" },
  { value: "transfers", label: "Transfer" },
  { value: "invoices", label: "Salg" },
  { value: "expenses", label: "Udgift" },
  { value: "wolt-orders", label: "Wolt-ordrer" },
  { value: "staff-food", label: "Staff food" },
  { value: "own-checks", label: "Egenkontrol" },
  { value: "count", label: "Count" },
  { value: "ordering", label: "Bestilling" },
  { value: "date-labels", label: "Datomærkning" },
  { value: "goods-receipts", label: "Varemodtagelse" },
  { value: "waste", label: "Waste" },
  { value: "kiosk", label: "Kiosk" },
  { value: "day-tasks", label: "Dagsopgaver" },
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
  const integrations = useIntegrations();
  const canManageIntegrations = usePermission("integrations.manage") && integrations?.onlinepos === true;
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
    ? (visibleCatalogSections.find((item) => item.value === activeCatalogSection)
        ?.label ?? "Produkter")
    : pathname === administrationPath
      ? "Administration"
      : (sectionTitles.find((item) =>
          pathname.startsWith(`${administrationPath}/${item.value}`),
        )?.label ?? "Administration");

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

  if (onProductForm) return null;

  const header = (
    <div className="flex min-w-0 flex-col gap-2">
      <PageTitle>
        {title}
      </PageTitle>
    </div>
  );

  const nav: { label: string; items: SectionNavItem[] } | null = inCatalog
    ? {
        label: "Katalogsektioner",
        items: visibleCatalogSections.map((item) => ({
          href: `${administrationPath}/${item.value}`,
          label: item.label,
          icon: catalogIcons[item.value],
          active: item.value === activeCatalogSection,
        })),
      }
    : inUsers && visibleUserSections.length > 1
      ? {
          label: "Brugersektioner",
          items: visibleUserSections.map((item) => ({
            href: `${administrationPath}/${item.value}`,
            label: item.label,
            icon: item.icon,
            active:
              item.value ===
              (pathname.startsWith(`${administrationPath}/users/roles`)
                ? "users/roles"
                : "users"),
          })),
        }
      : null;

  return (
    <>
      <AppPageHeader>{header}</AppPageHeader>
      {nav ? (
        <AppBottomBar>
          <div className="mx-auto w-full max-w-(--container-page)">
            <SectionNav label={nav.label} items={nav.items} />
          </div>
        </AppBottomBar>
      ) : null}
    </>
  );
}
