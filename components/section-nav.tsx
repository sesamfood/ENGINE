"use client";

import Link from "next/link";
import { useEffect, useRef, type ComponentType } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type SectionNavItem = {
  href: string;
  label: string;
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  active: boolean;
  badge?: number;
};

export function SectionNav({
  label,
  items,
  className,
}: {
  label: string;
  items: SectionNavItem[];
  className?: string;
}) {
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    navRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [items]);

  return (
    <nav ref={navRef} aria-label={label} className={cn("min-w-0", className)}>
      <ul className="no-scrollbar flex h-12 max-w-full items-center gap-1 overflow-x-auto overflow-y-hidden">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex h-full min-w-0 flex-1 sm:flex-none">
              <Link
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-full min-w-0 flex-1 items-center justify-center gap-1.5 px-2 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:px-4 sm:flex-none [&_svg]:hidden min-[420px]:[&_svg]:block [&_svg]:size-4 [&_svg]:shrink-0",
                  item.active &&
                    "font-semibold text-primary after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary hover:text-primary",
                )}
              >
                {Icon ? <Icon aria-hidden="true" /> : null}
                <span className="truncate">{item.label}</span>
                {item.badge ? <Badge>{item.badge}</Badge> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
