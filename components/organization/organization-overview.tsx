"use client";

import {
  Building2Icon,
  CalendarClockIcon,
  ChartNoAxesCombinedIcon,
  ClipboardListIcon,
  ClipboardCheckIcon,
  ListOrderedIcon,
  MessageSquarePlusIcon,
  PackageIcon,
  PlugIcon,
  KeyRoundIcon,
  MonitorCogIcon,
  StoreIcon,
  Trash2Icon,
  UsersIcon,
  UtensilsIcon,
} from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccess, usePermission } from "@/components/app-shell";

const sections = [
  {
    title: "Produkter",
    description: "Administrér produkter, kategorier og enheder.",
    href: "/organization/products",
    icon: PackageIcon,
    permissions: ["catalog.manage"],
  },
  {
    title: "Lokationer",
    description: "Administrér de lokationer, der bruges i Transfer.",
    href: "/organization/locations",
    icon: StoreIcon,
    permissions: ["locations.manage"],
  },
  {
    title: "Brugere",
    description: "Invitér brugere, og administrér deres roller.",
    href: "/organization/users",
    icon: UsersIcon,
    permissions: ["members.manage", "roles.manage"],
  },
  {
    title: "API",
    description: "Administrér API-nøgler til organisationens REST API.",
    href: "/organization/api",
    icon: KeyRoundIcon,
    permissions: ["apiKeys.manage"],
  },
  {
    title: "Kiosk",
    description: "Vælg kiosksider, og administrer lokationsbundne konti.",
    href: "/organization/kiosk",
    icon: MonitorCogIcon,
    permissions: ["organization.settings", "members.manage"],
  },
  {
    title: "Sidemenu",
    description: "Bestem rækkefølgen af organisationens menupunkter.",
    href: "/organization/sidebar",
    icon: ListOrderedIcon,
    permissions: ["organization.settings"],
  },
  {
    title: "Count",
    description: "Indstil frekvens og regler for Count-vinduet.",
    href: "/organization/count",
    icon: ClipboardListIcon,
    permissions: ["count.settings"],
  },
  {
    title: "Waste",
    description: "Indstil nulstilling og popularitet for Waste.",
    href: "/organization/waste",
    icon: Trash2Icon,
    permissions: ["waste.settings"],
  },
  {
    title: "Egenkontrol",
    description: "Opret kontroller, tidsplaner og regler for dokumentation.",
    href: "/organization/own-checks",
    icon: ClipboardCheckIcon,
    permissions: ["ownChecks.manage"],
  },
  {
    title: "Staff food",
    description: "Indstil vagtlængder, kategorier og tilladte produkter.",
    href: "/organization/staff-food",
    icon: UtensilsIcon,
    permissions: ["staffFood.manage"],
  },
  {
    title: "Vagtplan",
    description: "Indstil tidszonen for medarbejdernes vagtplan.",
    href: "/organization/schedule",
    icon: CalendarClockIcon,
    permissions: ["organization.settings"],
  },
  {
    title: "Integrationer",
    description: "Forbind eksterne systemer og administrer dataudveksling.",
    href: "/organization/integrations",
    icon: PlugIcon,
    permissions: ["integrations.manage"],
  },
  {
    title: "Målinger",
    description: "Opret og administrer organisationens tilpassede dashboardmålinger.",
    href: "/organization/metrics",
    icon: ChartNoAxesCombinedIcon,
    permissions: ["dashboard.manage"],
  },
  {
    title: "Feedback",
    description: "Vælg om brugerne kan sende feedback, og hvor den lander.",
    href: "/organization/feedback",
    icon: MessageSquarePlusIcon,
    permissions: ["organization.settings"],
  },
  {
    title: "Udseende",
    description: "Administrér logoer og organisationens identitet.",
    href: "/organization/appearance",
    icon: Building2Icon,
    permissions: ["organization.settings"],
  },
];

export function OrganizationOverview() {
  const access = useAccess();
  const canCatalog = usePermission("catalog.manage");
  const canLocations = usePermission("locations.manage");
  const canMembers = usePermission("members.manage");
  const canRoles = usePermission("roles.manage");
  const canApiKeys = usePermission("apiKeys.manage");
  const canOrganizationSettings = usePermission("organization.settings");
  const canCountSettings = usePermission("count.settings");
  const canWasteSettings = usePermission("waste.settings");
  const canOwnChecksManage = usePermission("ownChecks.manage");
  const canStaffFood = usePermission("staffFood.manage");
  const canIntegrations = usePermission("integrations.manage");
  const canDashboardManage = usePermission("dashboard.manage");
  const allowedPermissions = {
    "catalog.manage": canCatalog,
    "locations.manage": canLocations,
    "members.manage": canMembers,
    "roles.manage": canRoles,
    "apiKeys.manage": canApiKeys,
    "organization.settings": canOrganizationSettings,
    "count.settings": canCountSettings,
    "waste.settings": canWasteSettings,
    "ownChecks.manage": canOwnChecksManage,
    "staffFood.manage": canStaffFood,
    "integrations.manage": canIntegrations,
    "dashboard.manage": canDashboardManage,
  };

  if (!access) {
    return (
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-44 w-full" />
        ))}
      </div>
    );
  }

  if (!Object.values(allowedPermissions).some(Boolean)) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Du har ikke adgang til organisationens administration.
        </AlertDescription>
      </Alert>
    );
  }

  const availableSections = sections.filter(
    (section) =>
      section.permissions.some(
        (permission) => allowedPermissions[permission as keyof typeof allowedPermissions],
      ),
  );

  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {availableSections.map((section) => {
        const Icon = section.icon;
        const href =
          section.title === "Brugere" && !canMembers && canRoles
            ? "/organization/users/roles"
            : section.href;
        return (
          <Link
            key={section.href}
            href={href}
            aria-label={`Åbn ${section.title.toLocaleLowerCase("da")}`}
            className="group rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Card className="h-full transition-colors group-hover:bg-muted/50">
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
                <CardAction>
                  <Icon
                    className="size-5 text-muted-foreground"
                    aria-hidden="true"
                  />
                </CardAction>
              </CardHeader>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
