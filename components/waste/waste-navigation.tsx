"use client";

import { ChartNoAxesColumnIcon, Trash2Icon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useSidebar } from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient } from "@/lib/auth-client";
import { canViewWasteReports } from "@/lib/auth-permissions";

export function WasteNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const sidebar = useSidebar();
  const membership = authClient.useActiveMemberRole();
  const canReport = canViewWasteReports(membership.data?.role);

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
      <div className="mx-auto flex w-full max-w-[96rem] items-center">
        <Tabs
          value={pathname.startsWith("/waste/report") ? "report" : "register"}
          onValueChange={(value) =>
            router.push(value === "report" ? "/waste/report" : "/waste", {
              scroll: false,
            })
          }
        >
          <TabsList variant="line" aria-label="Waste-sektioner" className="h-12">
            <TabsTrigger value="register" className="min-w-28 px-4">
              <Trash2Icon data-icon="inline-start" />
              Registrér
            </TabsTrigger>
            {canReport ? (
              <TabsTrigger value="report" className="min-w-28 px-4">
                <ChartNoAxesColumnIcon data-icon="inline-start" />
                Rapport
              </TabsTrigger>
            ) : null}
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}
