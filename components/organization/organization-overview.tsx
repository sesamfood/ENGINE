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
import { authClient } from "@/lib/auth-client";
import { canManageCatalog, canManageMembers } from "@/lib/auth-permissions";

const sections = [
  {
    title: "Produkter",
    description: "Administrer produkter, kategorier og enheder.",
    href: "/organization/products",
    icon: PackageIcon,
    adminOnly: false,
  },
  {
    title: "Locations",
    description: "Administrer de locations, der bruges i transfers.",
    href: "/organization/locations",
    icon: StoreIcon,
    adminOnly: false,
  },
  {
    title: "Brugere",
    description: "Inviter brugere, og administrer deres roller.",
    href: "/organization/users",
    icon: UsersIcon,
    adminOnly: true,
  },
  {
    title: "Kiosk",
    description: "Vælg kiosksider, og administrer locationsbundne konti.",
    href: "/organization/kiosk",
    icon: MonitorCogIcon,
    adminOnly: true,
  },
  {
    title: "Sidemenu",
    description: "Bestem rækkefølgen af organisationens menupunkter.",
    href: "/organization/sidebar",
    icon: ListOrderedIcon,
    adminOnly: true,
  },
  {
    title: "Count",
    description: "Indstil frekvens og regler for count-vinduet.",
    href: "/organization/count",
    icon: ClipboardListIcon,
    adminOnly: true,
  },
  {
    title: "Waste",
    description: "Indstil nulstilling og popularitet for Waste.",
    href: "/organization/waste",
    icon: Trash2Icon,
    adminOnly: true,
  },
  {
    title: "Staff food",
    description: "Indstil vagtlængder, kategorier og tilladte produkter.",
    href: "/organization/staff-food",
    icon: UtensilsIcon,
    adminOnly: true,
  },
  {
    title: "Vagtplan",
    description: "Indstil tidszonen for medarbejdernes vagtplan.",
    href: "/organization/schedule",
    icon: CalendarClockIcon,
    adminOnly: true,
  },
  {
    title: "Integrationer",
    description: "Forbind eksterne systemer og administrer dataudveksling.",
    href: "/organization/integrations",
    icon: PlugIcon,
    adminOnly: true,
  },
  {
    title: "Udseende",
    description: "Administrer logoer og organisationens identitet.",
    href: "/organization/appearance",
    icon: Building2Icon,
    adminOnly: true,
  },
];

export function OrganizationOverview() {
  const membership = authClient.useActiveMemberRole();

  if (membership.isPending) {
    return (
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-44 w-full" />
        ))}
      </div>
    );
  }

  if (!canManageCatalog(membership.data?.role)) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Du har ikke adgang til organisationens administration.
        </AlertDescription>
      </Alert>
    );
  }

  const isAdmin = canManageMembers(membership.data?.role);
  const availableSections = sections.filter(
    (section) => !section.adminOnly || isAdmin,
  );

  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {availableSections.map((section) => {
        const Icon = section.icon;
        return (
          <Link
            key={section.href}
            href={section.href}
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
