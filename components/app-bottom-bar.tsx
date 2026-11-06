"use client";

import { useEffect, useRef, type ReactNode } from "react";
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
  const ref = useRef<HTMLDivElement>(null);

  // The shell reserves this much space so the bar never covers page content.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() =>
      root.style.setProperty("--bottom-bar-height", `${node.offsetHeight}px`),
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--bottom-bar-height");
    };
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        "fixed inset-x-0 bottom-0 left-(--bar-left) z-10 border-t bg-background px-4 pt-3 pb-(--spacing-safe-inset) md:right-0",
        className,
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
