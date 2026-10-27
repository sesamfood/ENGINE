"use client";

import { ChartNoAxesColumnIcon, UtensilsIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AppBottomBar } from "@/components/app-bottom-bar";
import { useKiosk, usePermission } from "@/components/app-shell";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function StaffFoodNavigation({ action }: { action?: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const kiosk = useKiosk();
  const canRegister = usePermission("staffFood.register");
  const canReport = usePermission("staffFood.report");
  // The report is not a kiosk destination.
  const kioskMode = Boolean(kiosk?.kioskModeEnabled);
  const showRegister = kioskMode || canRegister;
  const showReport = !kioskMode && canReport;
  const showSectionTabs = showRegister && showReport;

  useEffect(() => {
    if (!showSectionTabs) return;
    router.prefetch("/staff-food");
    router.prefetch("/staff-food/report");
  }, [router, showSectionTabs]);

  if (!showSectionTabs && !action) return null;

  return (
    <AppBottomBar>
      <div className="mx-auto flex w-full max-w-(--container-page) flex-col-reverse gap-2 sm:flex-row sm:items-center">
        {showSectionTabs ? (
          <Tabs
            value={pathname.startsWith("/staff-food/report") ? "report" : "register"}
            onValueChange={(value) =>
              router.push(
                value === "report" ? "/staff-food/report" : "/staff-food",
                { scroll: false },
              )
            }
            className="min-w-0"
          >
            <TabsList
              variant="line"
              aria-label="Staff food-sektioner"
              className="h-12 max-w-full justify-start overflow-x-auto overflow-y-hidden"
            >
              <TabsTrigger value="register" appearance="standard" className="min-w-28">
                <UtensilsIcon data-icon="inline-start" />
                Registrér
              </TabsTrigger>
              <TabsTrigger value="report" appearance="standard" className="min-w-28">
                <ChartNoAxesColumnIcon data-icon="inline-start" />
                Rapport
              </TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}
        {action}
      </div>
    </AppBottomBar>
  );
}
