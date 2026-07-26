"use client";

import {
  Building2Icon,
  PackageIcon,
  StoreIcon,
  UsersIcon,
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
    title: "Butikker",
    description: "Administrer de butikker, der bruges i transfers.",
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
