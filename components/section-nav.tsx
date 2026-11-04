"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type SectionNavItem = {
  href: string;
  label: string;
  shortLabel?: string;
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  active: boolean;
  badge?: number;
  badgeLabel?: string;
};

export function SectionNav({
  label,
  items,
  className,
  equalWidth = true,
}: {
  label: string;
  items: SectionNavItem[];
  className?: string;
  equalWidth?: boolean;
}) {
  const navRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    navRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [items]);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    const update = () =>
      setCanScrollRight(
        node.scrollWidth - node.clientWidth - node.scrollLeft > 4,
      );
    update();
    node.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      node.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [items]);

  return (
    <nav ref={navRef} aria-label={label} className={cn("min-w-0", className)}>
      <ul ref={listRef} data-scroll-right={canScrollRight ? "true" : undefined} className="no-scrollbar scroll-fade-x flex h-12 max-w-full items-center gap-1 overflow-x-auto overflow-y-hidden">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.href} className={cn("flex h-full min-w-0 sm:flex-none", equalWidth ? "flex-1" : "shrink-0 flex-none")}>
              <Link
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-full min-w-0 flex-1 items-center justify-center gap-1.5 px-2 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-4 sm:flex-none [&_svg]:hidden min-[420px]:[&_svg]:block [&_svg]:size-4 [&_svg]:shrink-0",
                  item.active &&
                    "font-semibold text-primary after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary hover:text-primary",
                )}
              >
                {Icon ? <Icon aria-hidden="true" /> : null}
                {item.shortLabel ? (
                  <>
                    <span className="truncate sm:hidden">{item.shortLabel}</span>
                    <span className="hidden truncate sm:inline">{item.label}</span>
                  </>
                ) : (
                  <span className="truncate">{item.label}</span>
                )}
                {item.badge ? <Badge className="shrink-0">{item.badge}</Badge> : null}
                {item.badge && item.badgeLabel ? (
                  <span className="sr-only">{item.badgeLabel}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
