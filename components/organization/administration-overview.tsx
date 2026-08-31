"use client";

import {
  Building2Icon,
  CalendarClockIcon,
  ChartNoAxesCombinedIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  KeyRoundIcon,
  ListOrderedIcon,
  MessageSquarePlusIcon,
  MonitorCogIcon,
  PackageIcon,
  PlugIcon,
  StoreIcon,
  Trash2Icon,
  UsersIcon,
  UtensilsIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useAccess, usePermission } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { PermissionId } from "@/lib/auth-permissions";

type AdministrationPermission = Extract<
  PermissionId,
  | "apiKeys.manage"
    | "catalog.manage"
    | "count.settings"
    | "dashboard.manage"
    | "integrations.manage"
    | "locations.manage"
    | "members.manage"
    | "organization.settings"
    | "ownChecks.manage"
    | "roles.manage"
    | "staffFood.manage"
    | "waste.settings"
>;

type AdministrationSection = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  permissions: AdministrationPermission[];
};

type AdministrationCategory = {
  id: string;
  title: string;
  description: string;
  sections: AdministrationSection[];
};

const categories: AdministrationCategory[] = [
  {
    id: "organisation",
    title: "Organisation",
    description: "Administrér lokationer, brugere og organisationens udtryk.",
    sections: [
      {
        title: "Lokationer",
        description: "Administrér de lokationer, der bruges i Transfer.",
        href: "/administration/locations",
        icon: StoreIcon,
        permissions: ["locations.manage"],
      },
      {
        title: "Brugere",
        description: "Invitér brugere, og administrér deres roller.",
        href: "/administration/users",
        icon: UsersIcon,
        permissions: ["members.manage", "roles.manage"],
      },
      {
        title: "Udseende",
        description: "Administrér logoer og organisationens identitet.",
        href: "/administration/appearance",
        icon: Building2Icon,
        permissions: ["organization.settings"],
      },
    ],
  },
  {
    id: "drift",
    title: "Drift",
    description: "Opsæt produkter og reglerne for den daglige drift.",
    sections: [
      {
        title: "Produkter",
        description: "Administrér produkter, kategorier og enheder.",
        href: "/administration/products",
        icon: PackageIcon,
        permissions: ["catalog.manage"],
      },
      {
        title: "Count",
        description: "Indstil frekvens og regler for Count-vinduet.",
        href: "/administration/count",
        icon: ClipboardListIcon,
        permissions: ["count.settings"],
      },
      {
        title: "Waste",
        description: "Indstil nulstilling og popularitet for Waste.",
        href: "/administration/waste",
        icon: Trash2Icon,
        permissions: ["waste.settings"],
      },
      {
        title: "Egenkontrol",
        description: "Opret kontroller, tidsplaner og regler for dokumentation.",
        href: "/administration/own-checks",
        icon: ClipboardCheckIcon,
        permissions: ["ownChecks.manage"],
      },
      {
        title: "Staff food",
        description: "Indstil vagtlængder, kategorier og tilladte produkter.",
        href: "/administration/staff-food",
        icon: UtensilsIcon,
        permissions: ["staffFood.manage"],
      },
      {
        title: "Vagtplan",
        description: "Indstil tidszonen for medarbejdernes vagtplan.",
        href: "/administration/schedule",
        icon: CalendarClockIcon,
        permissions: ["organization.settings"],
      },
    ],
  },
  {
    id: "app",
    title: "Appopsætning",
    description: "Tilpas kiosk, navigation og feedback.",
    sections: [
      {
        title: "Kiosk",
        description: "Vælg kiosksider, og administrér lokationsbundne konti.",
        href: "/administration/kiosk",
        icon: MonitorCogIcon,
        permissions: ["organization.settings", "members.manage"],
      },
      {
        title: "Sidemenu",
        description: "Bestem rækkefølgen af organisationens menupunkter.",
        href: "/administration/sidebar",
        icon: ListOrderedIcon,
        permissions: ["organization.settings"],
      },
      {
        title: "Feedback",
        description: "Vælg om brugerne kan sende feedback, og hvor den lander.",
        href: "/administration/feedback",
        icon: MessageSquarePlusIcon,
        permissions: ["organization.settings"],
      },
    ],
  },
  {
    id: "data-og-integrationer",
    title: "Data og integrationer",
    description: "Forbind eksterne systemer, målinger og API-adgang.",
    sections: [
      {
        title: "Integrationer",
        description: "Forbind eksterne systemer, og administrér dataudveksling.",
        href: "/administration/integrations",
        icon: PlugIcon,
        permissions: ["integrations.manage"],
      },
      {
        title: "Målinger",
        description: "Opret og administrér organisationens dashboardmålinger.",
        href: "/administration/metrics",
        icon: ChartNoAxesCombinedIcon,
        permissions: ["dashboard.manage"],
      },
      {
        title: "API",
        description: "Administrér API-nøgler til organisationens REST API.",
        href: "/administration/api",
        icon: KeyRoundIcon,
        permissions: ["apiKeys.manage"],
      },
    ],
  },
];

export function AdministrationOverview() {
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
  const allowedPermissions: Record<AdministrationPermission, boolean> = {
    "apiKeys.manage": canApiKeys,
    "catalog.manage": canCatalog,
    "count.settings": canCountSettings,
    "dashboard.manage": canDashboardManage,
    "integrations.manage": canIntegrations,
    "locations.manage": canLocations,
    "members.manage": canMembers,
    "organization.settings": canOrganizationSettings,
    "ownChecks.manage": canOwnChecksManage,
    "roles.manage": canRoles,
    "staffFood.manage": canStaffFood,
    "waste.settings": canWasteSettings,
  };

  if (!access) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-32 w-full" />
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

  const availableCategories = categories
    .map((category) => ({
      ...category,
      sections: category.sections.filter((section) =>
        section.permissions.some((permission) => allowedPermissions[permission]),
      ),
    }))
    .filter((category) => category.sections.length > 0);

  return (
    <div className="flex flex-col gap-10 pb-10">
      {availableCategories.map((category) => (
        <section
          key={category.id}
          aria-labelledby={`administration-${category.id}`}
          className="flex flex-col gap-4"
        >
          <div className="flex max-w-2xl flex-col gap-1">
            <h2
              id={`administration-${category.id}`}
              className="text-xl font-semibold tracking-tight"
            >
              {category.title}
            </h2>
            <p className="text-sm text-muted-foreground">
              {category.description}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {category.sections.map((section) => {
              const Icon = section.icon;
              const href =
                section.title === "Brugere" && !canMembers && canRoles
                  ? "/administration/users/roles"
                  : section.href;

              return (
                <Link
                  key={section.href}
                  href={href}
                  aria-label={`Åbn ${section.title.toLocaleLowerCase("da")}`}
                  className="group rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Card
                    size="sm"
                    className="h-full transition-colors group-hover:bg-muted/50 group-active:bg-muted/50"
                  >
                    <CardHeader>
                      <CardTitle>{section.title}</CardTitle>
                      <CardDescription>{section.description}</CardDescription>
                      <CardAction>
                        <Icon
                          className="text-muted-foreground"
                          aria-hidden="true"
                        />
                      </CardAction>
                    </CardHeader>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
