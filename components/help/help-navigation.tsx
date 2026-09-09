"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDownIcon, LayoutGridIcon, MenuIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type NavigationTopic = {
  slug: string;
  label: string;
  icon: ReactNode;
  guides: { slug: string; label: string }[];
};

export function HelpNavigation({ topics }: { topics: NavigationTopic[] }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const currentTopic = topics.find(
    (topic) =>
      pathname === `/help/${topic.slug}` ||
      pathname.startsWith(`/help/${topic.slug}/`),
  );

  function link(href: string, children: ReactNode) {
    const active = pathname === href;
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        onClick={() => setMobileOpen(false)}
        className={cn(
          "flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
          active
            ? "bg-muted font-medium text-foreground"
            : "text-muted-foreground",
        )}
      >
        {children}
      </Link>
    );
  }

  const navigation = (
    <nav aria-label="Hjælpeemner">
      <ul className="flex flex-col gap-1">
        <li>
          {link(
            "/help",
            <>
              <LayoutGridIcon className="size-4 shrink-0" aria-hidden="true" />
              <span>Alle hjælpeemner</span>
            </>,
          )}
        </li>
        {topics.map((topic) => (
          <li key={topic.slug}>
            <Collapsible
              key={`${topic.slug}-${currentTopic?.slug === topic.slug}`}
              defaultOpen={currentTopic?.slug === topic.slug}
            >
              <CollapsibleTrigger
                className={cn(
                  "group flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                  currentTopic?.slug === topic.slug
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
                aria-label={`Undersider til ${topic.label}`}
              >
                {topic.icon}
                <span className="flex-1">{topic.label}</span>
                <ChevronDownIcon
                  className="size-4 shrink-0 transition-transform group-aria-expanded:rotate-180"
                  aria-hidden="true"
                />
              </CollapsibleTrigger>
              {topic.guides.length > 0 ? (
                <CollapsibleContent>
                  <ul className="my-1 ml-5 flex flex-col gap-1 border-l pl-2">
                    {topic.guides.map((guide) => (
                      <li key={guide.slug}>
                        {link(`/help/${topic.slug}/${guide.slug}`, guide.label)}
                      </li>
                    ))}
                  </ul>
                </CollapsibleContent>
              ) : null}
            </Collapsible>
          </li>
        ))}
      </ul>
    </nav>
  );

  return (
    <aside className="sticky top-16 z-10 -mx-4 border-b bg-background px-4 py-2 lg:top-24 lg:mx-0 lg:mt-10 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:border-0 lg:p-0">
      <div className="hidden lg:block">{navigation}</div>
      <Collapsible
        open={mobileOpen}
        onOpenChange={setMobileOpen}
        className="lg:hidden"
      >
        <CollapsibleTrigger
          render={
            <Button
              variant="ghost"
              size="lg"
              className="min-h-11 w-full justify-between"
            />
          }
        >
          <span className="flex items-center gap-2">
            <MenuIcon className="size-4" aria-hidden="true" />
            Hjælpeemner
          </span>
          <span className="truncate">{currentTopic?.label ?? "Overblik"}</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="max-h-[calc(100dvh-9rem)] overflow-y-auto pb-2">
          {navigation}
        </CollapsibleContent>
      </Collapsible>
    </aside>
  );
}
