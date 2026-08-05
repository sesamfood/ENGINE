"use client";

import { BoxesIcon, ClipboardListIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { ReactNode } from "react";
import { useSidebar } from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function CountNavigation({ action }: { action?: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const sidebar = useSidebar();
  const kiosk = useQuery(api.kiosk.getRuntimeContext);
  const showCount = !kiosk?.kioskModeEnabled || pathname === "/count" || kiosk.settings?.enabledPages.includes("count.register");
  const showStock = !kiosk?.kioskModeEnabled || kiosk.settings?.enabledPages.includes("count.stock");

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
      <div className="mx-auto flex w-full max-w-[96rem] items-center justify-between gap-3">
        <Tabs
          value={pathname.startsWith("/count/stock") ? "stock" : "count"}
          onValueChange={(value) =>
            router.push(value === "stock" ? "/count/stock" : "/count", {
              scroll: false,
            })
          }
          className="min-w-0"
        >
          <TabsList
            variant="line"
            aria-label="Countsektioner"
            className="h-12 max-w-full justify-start"
          >
            {showCount ? <TabsTrigger value="count" className="min-w-28 px-4">
              <ClipboardListIcon data-icon="inline-start" />
              Count
            </TabsTrigger> : null}
            {showStock ? <TabsTrigger value="stock" className="min-w-24 px-4">
              <BoxesIcon data-icon="inline-start" />
              Lager
            </TabsTrigger> : null}
          </TabsList>
        </Tabs>
        {action}
      </div>
    </div>
  );
}
