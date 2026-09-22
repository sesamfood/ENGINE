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
        cn(
          "fixed inset-x-0 bottom-0 z-10 border-t bg-background p-3 pb-(--spacing-safe-inset) md:right-0",
          className,
        ),
        "left-(--bar-left)",
      )}
      style={
        {
          "--bar-left": sidebar.isMobile
            ? 0
            : sidebar.state === "collapsed"
              ? "var(--sidebar-width-icon)"
              : "var(--sidebar-width)",
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
