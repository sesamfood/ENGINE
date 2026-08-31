import type { ReactNode } from "react";
import { ArrowLeftIcon, BookOpenIcon, LayoutGridIcon } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { helpFeatures } from "@/components/help/help-features";

function HelpNavigation() {
  return (
    <aside className="sticky top-16 z-10 -mx-4 border-y bg-background px-4 py-2 lg:top-24 lg:mx-0 lg:self-start lg:border-0 lg:bg-transparent lg:p-0">
      <nav aria-label="Hjælpeemner" className="overflow-x-auto lg:overflow-visible">
        <ol className="flex min-w-max gap-1 lg:min-w-0 lg:flex-col">
          <li>
            <Link
              href="/help"
              className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 lg:w-full"
            >
              <span className="font-mono text-[0.65rem] text-muted-foreground/70">00</span>
              <LayoutGridIcon className="size-4 shrink-0" aria-hidden="true" />
              <span>Overblik</span>
            </Link>
          </li>
          {helpFeatures.map((feature) => {
            const Icon = feature.icon;
            return (
              <li key={feature.slug}>
                <Link
                  href={`/help/${feature.slug}`}
                  className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 lg:w-full"
                >
                  <span className="font-mono text-[0.65rem] text-muted-foreground/70">
                    {feature.number}
                  </span>
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span>{feature.label}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>
    </aside>
  );
}

export function HelpShell({ children }: { children: ReactNode }) {
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
            <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <BookOpenIcon className="size-4" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold">Hjælp</span>
              <span className="hidden text-xs text-muted-foreground sm:block">
                Guide til appen
              </span>
            </span>
          </Link>
          <Link
            href="/"
            className={buttonVariants({
              variant: "outline",
              size: "lg",
              className: "min-h-11",
            })}
          >
            <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
            Åbn appen
          </Link>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[96rem] grid-cols-[minmax(0,1fr)] gap-8 px-4 sm:px-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:px-8">
        <HelpNavigation />
        <div id="help-content" className="min-w-0">
          {children}
        </div>
      </div>
    </main>
  );
}
