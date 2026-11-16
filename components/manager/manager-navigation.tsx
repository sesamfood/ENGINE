"use client";

import { TargetIcon, UtensilsIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { AppBottomBar } from "@/components/app-bottom-bar";
import { usePermission } from "@/components/app-shell";
import { SectionNav } from "@/components/section-nav";

export function ManagerNavigation() {
  const pathname = usePathname();
  const canTargets = usePermission("dashboard.manageTargets");
  const canStaffFood = usePermission("staffFood.report");
  const items = [
    ...(canTargets
      ? [{ href: "/manager/targets", label: "Mål", icon: TargetIcon, active: pathname.startsWith("/manager/targets") }]
      : []),
    ...(canStaffFood
      ? [{ href: "/manager/staff-food", label: "Staff food", icon: UtensilsIcon, active: pathname.startsWith("/manager/staff-food") }]
      : []),
  ];
  if (!items.length) return null;
  return (
    <AppBottomBar>
      <div className="mx-auto flex w-full max-w-(--container-page)">
        <SectionNav label="Manager-sektioner" items={items} />
      </div>
    </AppBottomBar>
  );
}
