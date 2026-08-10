"use client";

import {
  Building2Icon,
  CalendarClockIcon,
  ClipboardListIcon,
  ListOrderedIcon,
  PackageIcon,
  PlugIcon,
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
    description: "Administrer produkter, kategorier og enheder.",
    href: "/organization/products",
    icon: PackageIcon,
    permissions: ["catalog.manage"],
  },
  {
    title: "Lokationer",
    description: "Administrer de lokationer, der bruges i flytninger.",
    href: "/organization/locations",
    icon: StoreIcon,
    permissions: ["locations.manage"],
  },
  {
    title: "Brugere",
    description: "Inviter brugere, og administrer deres roller.",
    href: "/organization/users",
    icon: UsersIcon,
    permissions: ["members.manage", "roles.manage"],
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
    title: "Optælling",
    description: "Indstil frekvens og regler for optællingsvinduet.",
    href: "/organization/count",
    icon: ClipboardListIcon,
    permissions: ["count.settings"],
  },
  {
    title: "Spild",
    description: "Indstil nulstilling og popularitet for spild.",
    href: "/organization/waste",
    icon: Trash2Icon,
    permissions: ["waste.settings"],
  },
  {
    title: "Personalemad",
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
    title: "Udseende",
    description: "Administrer logoer og organisationens identitet.",
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
  const canOrganizationSettings = usePermission("organization.settings");
  const canCountSettings = usePermission("count.settings");
  const canWasteSettings = usePermission("waste.settings");
  const canStaffFood = usePermission("staffFood.manage");
  const canIntegrations = usePermission("integrations.manage");
  const allowedPermissions = {
    "catalog.manage": canCatalog,
    "locations.manage": canLocations,
    "members.manage": canMembers,
    "roles.manage": canRoles,
    "organization.settings": canOrganizationSettings,
    "count.settings": canCountSettings,
    "waste.settings": canWasteSettings,
    "staffFood.manage": canStaffFood,
    "integrations.manage": canIntegrations,
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
