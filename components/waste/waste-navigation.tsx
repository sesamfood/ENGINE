"use client";

import {
  ChartNoAxesColumnIcon,
  PackageXIcon,
  Trash2Icon,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSidebar } from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient } from "@/lib/auth-client";
import { canViewWasteReports } from "@/lib/auth-permissions";

export function WasteNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const sidebar = useSidebar();
  const membership = authClient.useActiveMemberRole();
  const kiosk = useQuery(api.kiosk.getRuntimeContext);
  const showRegister = !kiosk?.kioskModeEnabled || kiosk.settings?.enabledPages.includes("waste.register");
  const showBadDelivery = !kiosk?.kioskModeEnabled || kiosk.settings?.enabledPages.includes("waste.badDelivery");
  const canReport = canViewWasteReports(membership.data?.role) || Boolean(kiosk?.kioskModeEnabled && kiosk.settings?.enabledPages.includes("waste.report"));
  const value = pathname.startsWith("/waste/report")
    ? "report"
    : pathname.startsWith("/waste/bad-delivery")
      ? "badDelivery"
      : "register";

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-10 border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:right-0"
      style={{
        left: sidebar.isMobile
          ? 0
          : sidebar.state === "collapsed"
            ? "var(--sidebar-width-icon)"
            : "var(--sidebar-width)",
      }}
    >
      <div className="mx-auto flex w-full max-w-[96rem] flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center">
        <Tabs
          value={value}
          onValueChange={(next) => {
            const href =
              next === "report"
                ? "/waste/report"
                : next === "badDelivery"
                  ? "/waste/bad-delivery"
                  : "/waste";
            router.push(href, { scroll: false });
          }}
        >
          <TabsList variant="line" aria-label="Waste-sektioner" className="h-12">
            {showRegister ? <TabsTrigger value="register" className="min-w-28 px-4">
              <Trash2Icon data-icon="inline-start" />
              Registrér
            </TabsTrigger> : null}
            {showBadDelivery ? <TabsTrigger value="badDelivery" className="min-w-28 px-4">
              <PackageXIcon data-icon="inline-start" />
              Dårlig levering
            </TabsTrigger> : null}
            {canReport ? (
              <TabsTrigger value="report" className="min-w-28 px-4">
                <ChartNoAxesColumnIcon data-icon="inline-start" />
                Rapport
              </TabsTrigger>
            ) : null}
          </TabsList>
        </Tabs>
        {value === "badDelivery" ? (
          <div
            id="bad-delivery-primary-action"
            className="w-full sm:ml-auto sm:w-auto"
          />
        ) : null}
      </div>
    </div>
  );
}
