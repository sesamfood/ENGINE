"use client";

import type { ReactNode } from "react";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export function AppBottomBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const sidebar = useSidebar();
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-10 border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:right-0",
        className,
      )}
      style={{
        left: sidebar.isMobile
          ? 0
          : sidebar.state === "collapsed"
            ? "var(--sidebar-width-icon)"
            : "var(--sidebar-width)",
      }}
    >
      {children}
    </div>
  );
}
