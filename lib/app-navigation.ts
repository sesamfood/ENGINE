import type { PermissionId } from "./auth-permissions";
import { kioskDestinations } from "./kiosk";
import { sidebarItems, type SidebarItemId } from "./sidebar-navigation";

const administrationPermissions: PermissionId[] = [
  "catalog.manage",
  "locations.manage",
  "organization.settings",
  "count.settings",
  "waste.settings",
  "goodsReceipts.settings",
  "ownChecks.manage",
  "integrations.manage",
  "staffFood.manage",
  "members.manage",
  "roles.manage",
  "apiKeys.manage",
  "dashboard.manage",
];

export function canOpenAdministration(permissions: readonly string[]) {
  return administrationPermissions.some((permission) =>
    permissions.includes(permission),
  );
}

type Route = { href: string; permission: PermissionId };
const routes: Record<SidebarItemId, readonly Route[]> = {
  dashboard: [{ href: "/dashboard", permission: "dashboard.view" }],
  woltOrders: [{ href: "/wolt-orders", permission: "sales.viewDetail" }],
  ordering: [{ href: "/ordering", permission: "ordering.plan" }],
  transfers: [
    { href: "/transfers", permission: "transfers.manage" },
    { href: "/transfers/history", permission: "transfers.view" },
  ],
  goodsReceipts: [
    { href: "/goods-receipts", permission: "goodsReceipts.register" },
  ],
  waste: [
    { href: "/waste", permission: "waste.register" },
    { href: "/waste/report", permission: "waste.report" },
  ],
  ownChecks: [
    { href: "/own-checks", permission: "ownChecks.perform" },
    { href: "/own-checks/overview", permission: "ownChecks.view" },
    { href: "/own-checks/documentation", permission: "ownChecks.export" },
  ],
  staffFood: [{ href: "/staff-food", permission: "staffFood.register" }],
  count: [
    { href: "/count", permission: "count.register" },
    { href: "/count/stock", permission: "count.viewStock" },
  ],
  employees: [
    { href: "/employees", permission: "employees.schedule" },
    { href: "/employees/directory", permission: "employees.directory" },
  ],
  organization: administrationPermissions.map((permission) => ({
    href: "/administration",
    permission,
  })),
};

type KioskNavigation = {
  kioskModeEnabled: boolean;
  settings: { homePage: string | null; enabledPages: string[] } | null;
};

export function kioskHome(kiosk: KioskNavigation, countLocked: boolean) {
  if (countLocked) return "/count";
  return (
    kioskDestinations.find(
      (destination) => destination.id === kiosk.settings?.homePage,
    )?.route ?? "/transfers"
  );
}

export function resolveAppNavigation({
  permissions,
  kiosk,
  countLocked,
  woltEnabled,
}: {
  permissions: readonly string[];
  kiosk: KioskNavigation | null;
  countLocked: boolean;
  woltEnabled: boolean;
}) {
  return sidebarItems.flatMap((item) => {
    const candidates = routes[item.id];
    if (countLocked && !["count", "waste", "organization"].includes(item.id))
      return [];
    if (kiosk?.kioskModeEnabled) {
      if (item.id === "organization") return [];
      if (countLocked)
        return [{ ...item, href: item.id === "count" ? "/count" : "/waste" }];
      const root = candidates[0].href;
      const destination = kioskDestinations.find(
        (page) =>
          (page.route === root || page.route.startsWith(`${root}/`)) &&
          kiosk.settings?.enabledPages.includes(page.id),
      );
      return destination ? [{ ...item, href: destination.route }] : [];
    }
    if (item.id === "woltOrders" && !woltEnabled) return [];
    const route = candidates.find((candidate) =>
      permissions.includes(candidate.permission),
    );
    return route ? [{ ...item, href: route.href }] : [];
  });
}

export function homeDestination(
  navigation: ReturnType<typeof resolveAppNavigation>,
) {
  const order: SidebarItemId[] = [
    "dashboard",
    "woltOrders",
    "transfers",
    "goodsReceipts",
    "waste",
    "ownChecks",
    "staffFood",
    "count",
    "employees",
    "ordering",
    "organization",
  ];
  for (const id of order) {
    const item = navigation.find((candidate) => candidate.id === id);
    if (item) return item.href;
  }
  return "/profile";
}
