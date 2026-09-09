import type { ReactNode } from "react";
import { ArrowLeftIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { helpFeatures, helpPages } from "@/components/help/help-features";
import {
  HelpNavigation,
  type NavigationGuide,
} from "@/components/help/help-navigation";
import type { HelpGuide } from "./help-types";
import { HelpSearch } from "./help-search";

function navigationGuides(
  guides: HelpGuide[],
  baseHref: string,
): NavigationGuide[] {
  return guides.map((guide) => {
    const href = `${baseHref}/${guide.slug}`;
    return {
      href,
      label: guide.label,
      children: navigationGuides(guide.children ?? [], href),
    };
  });
}

export function HelpShell({ children }: { children: ReactNode }) {
  const searchDocuments = helpPages.map(({ feature, guide, href, parents }) => ({
    href,
    feature: [feature.label, ...parents.map((parent) => parent.label)].join(" · "),
    label: guide.label,
    summary: guide.summary,
    sections: [
      ...guide.sections.map((section) => ({
        id: section.id,
        title: section.title,
        text: [
          ...(section.paragraphs ?? []),
          ...(section.steps ?? []),
          ...(section.bullets ?? []),
          ...(section.screenshot
            ? [section.screenshot.alt, section.screenshot.caption]
            : []),
        ].join(" "),
      })),
      ...(guide.troubleshooting?.length
        ? [
            {
              id: "troubleshooting",
              title: "Spørgsmål og fejlfinding",
              text: guide.troubleshooting
                .map((item) => `${item.question} ${item.answer}`)
                .join(" "),
            },
          ]
        : []),
    ],
  }));
  return (
    <main className="min-h-screen bg-background">
      <a
        href="#help-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-background focus:px-4 focus:py-3 focus:text-sm focus:font-medium focus:ring-3 focus:ring-ring/50"
      >
        Gå til indhold
      </a>

      <header className="sticky top-0 z-20 border-b bg-background">
        <div className="mx-auto flex min-h-16 w-full max-w-[96rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            href="/help"
            className="flex min-h-11 items-center gap-3 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Image
              src="/favicon.ico"
              alt=""
              width={36}
              height={36}
              unoptimized
              loading="eager"
              className="size-9 shrink-0 object-contain"
            />
            <span>
              <span className="block text-sm font-semibold">Hjælp</span>
              <span className="hidden text-xs text-muted-foreground sm:block">
                Funktioner og opsætning
              </span>
            </span>
          </Link>
          <div className="min-w-0 flex-1 sm:max-w-sm">
            <HelpSearch documents={searchDocuments} />
          </div>
          <Link
            href="/"
            className={buttonVariants({
              variant: "outline",
              size: "lg",
              className: "min-h-11",
            })}
          >
            <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
            Tilbage til appen
          </Link>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[96rem] grid-cols-[minmax(0,1fr)] gap-x-8 px-4 sm:px-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:px-8">
        <HelpNavigation
          topics={helpFeatures.map((feature) => {
            const Icon = feature.icon;
            return {
              slug: feature.slug,
              href: `/help/${feature.slug}/overblik`,
              label: feature.label,
              icon: <Icon className="size-4 shrink-0" aria-hidden="true" />,
              children: navigationGuides(feature.guides, `/help/${feature.slug}`),
            };
          })}
        />
        <div id="help-content" className="min-w-0">
          {children}
        </div>
      </div>
    </main>
  );
}
