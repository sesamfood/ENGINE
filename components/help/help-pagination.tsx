import Link from "next/link";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { helpPages } from "./help-features";

export function HelpPagination({ href }: { href: string }) {
  const index = helpPages.findIndex((page) => page.href === href);
  const previous = helpPages[index - 1];
  const next = helpPages[index + 1];

  return (
    <nav
      aria-label="Næste og forrige side"
      className="grid gap-3 sm:grid-cols-2"
    >
      <Link
        href={previous?.href ?? "/help"}
        rel={previous ? "prev" : undefined}
        className="flex min-h-24 items-center gap-3 rounded-xl border p-4 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ArrowLeftIcon
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <span className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            {previous ? `Forrige · ${previous.feature.label}` : "Tilbage til"}
          </span>
          <span className="font-semibold">
            {previous?.guide.label ?? "Alle hjælpeemner"}
          </span>
        </span>
      </Link>
      {next ? (
        <Link
          href={next.href}
          rel="next"
          className="flex min-h-24 items-center justify-between gap-3 rounded-xl border p-4 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              Næste · {next.feature.label}
            </span>
            <span className="font-semibold">{next.guide.label}</span>
          </span>
          <ArrowRightIcon
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </Link>
      ) : (
        <Link
          href="/help"
          className="flex min-h-24 items-center justify-between gap-3 rounded-xl border p-4 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              Du har nået sidste guide
            </span>
            <span className="font-semibold">Tilbage til alle hjælpeemner</span>
          </span>
          <ArrowRightIcon className="size-4 shrink-0" aria-hidden="true" />
        </Link>
      )}
    </nav>
  );
}
