"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccess, usePermission } from "@/components/app-shell";
import { Spinner } from "@/components/ui/spinner";
import { kioskDestination, type KioskDestinationId } from "@/lib/kiosk";

export default function Home() {
  const router = useRouter();
  const access = useAccess();
  const kiosk = access?.kiosk;
  const canDashboard = usePermission("dashboard.view");
  const canTransfersManage = usePermission("transfers.manage");
  const canTransfersView = usePermission("transfers.view");
  const canWasteRegister = usePermission("waste.register");
  const canWasteReport = usePermission("waste.report");
  const canStaffFood = usePermission("staffFood.register");
  const canCountRegister = usePermission("count.register");
  const canCountStock = usePermission("count.viewStock");
  const canEmployeesSchedule = usePermission("employees.schedule");
  const canEmployeesDirectory = usePermission("employees.directory");
  const canCatalog = usePermission("catalog.manage");
  const canLocations = usePermission("locations.manage");
  const canOrganizationSettings = usePermission("organization.settings");
  const canCountSettings = usePermission("count.settings");
  const canWasteSettings = usePermission("waste.settings");
  const canIntegrations = usePermission("integrations.manage");
  const canStaffFoodManage = usePermission("staffFood.manage");
  const canMembers = usePermission("members.manage");
  const canRoles = usePermission("roles.manage");
  const canOrganization =
    canCatalog ||
    canLocations ||
    canOrganizationSettings ||
    canCountSettings ||
    canWasteSettings ||
    canIntegrations ||
    canStaffFoodManage ||
    canMembers ||
    canRoles;

  useEffect(() => {
    if (!access) return;
    const kioskHome = kiosk?.kioskModeEnabled && kiosk.settings?.homePage
      ? kioskDestination(kiosk.settings.homePage as KioskDestinationId).route
      : "/transfers";
    const href = kiosk?.isKioskAccount
      ? kioskHome
      : canDashboard
        ? "/dashboard"
        : canTransfersManage
          ? "/transfers"
          : canTransfersView
            ? "/transfers/history"
            : canWasteRegister
              ? "/waste"
              : canWasteReport
                ? "/waste/report"
                : canStaffFood
                  ? "/staff-food"
                  : canCountRegister
                    ? "/count"
                    : canCountStock
                      ? "/count/stock"
                      : canEmployeesSchedule
                        ? "/employees"
                        : canEmployeesDirectory
                          ? "/employees/directory"
                          : canOrganization
                            ? "/organization"
                            : "/profile";
    router.replace(href);
  }, [
    access,
    canCatalog,
    canCountRegister,
    canCountStock,
    canDashboard,
    canEmployeesDirectory,
    canEmployeesSchedule,
    canIntegrations,
    canLocations,
    canMembers,
    canOrganization,
    canOrganizationSettings,
    canRoles,
    canStaffFood,
    canStaffFoodManage,
    canTransfersManage,
    canTransfersView,
    canWasteRegister,
    canWasteReport,
    canWasteSettings,
    kiosk,
    router,
  ]);

  return (
    <main className="grid min-h-80 place-items-center" aria-label="Åbner startside">
      <Spinner />
    </main>
  );
}
