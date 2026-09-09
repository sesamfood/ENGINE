"use client";

import { BoxesIcon, ClipboardListIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useKiosk, usePermission } from "@/components/app-shell";
import { AppBottomBar } from "@/components/app-bottom-bar";
import { cn } from "@/lib/utils";

export function CountNavigation({ action }: { action?: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const kiosk = useKiosk();
  const canRegister = usePermission("count.register");
  const canStock = usePermission("count.viewStock");
  const showCount = kiosk?.kioskModeEnabled
    ? pathname === "/count" ||
      kiosk.settings?.enabledPages.includes("count.register")
    : canRegister;
  const showStock = kiosk?.kioskModeEnabled
    ? kiosk.settings?.enabledPages.includes("count.stock")
    : canStock;
  const showSectionTabs = Number(showCount) + Number(showStock) > 1;

  useEffect(() => {
    if (showCount) router.prefetch("/count");
    if (showStock) router.prefetch("/count/stock");
  }, [router, showCount, showStock]);

  if (!showSectionTabs && !action) return null;

  return (
    <AppBottomBar>
      <div
        className={cn(
          "mx-auto flex w-full max-w-[96rem] items-center gap-3",
          showSectionTabs ? "justify-between" : "justify-end",
        )}
      >
        {showSectionTabs ? (
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
              aria-label="Count-sektioner"
              className="h-12 max-w-full justify-start"
            >
              {showCount ? (
                <TabsTrigger value="count" className="min-w-28 px-4">
                  <ClipboardListIcon data-icon="inline-start" />
                  Count
                </TabsTrigger>
              ) : null}
              {showStock ? (
                <TabsTrigger value="stock" className="min-w-24 px-4">
                  <BoxesIcon data-icon="inline-start" />
                  Lager
                </TabsTrigger>
              ) : null}
            </TabsList>
          </Tabs>
        ) : null}
        {action}
      </div>
    </AppBottomBar>
  );
}
