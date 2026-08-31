import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { helpFeatures } from "@/components/help/help-features";
import { HelpOverviewVisual } from "@/components/help/help-visuals";

export function HelpIndex() {
  return (
    <div className="py-14 sm:py-20 lg:py-24">
      <section className="flex flex-col gap-8">
        <div className="grid gap-8 xl:grid-cols-[1fr_0.72fr] xl:items-end">
          <div className="flex max-w-4xl flex-col gap-5">
            <p className="text-sm font-semibold tracking-[0.16em] text-primary uppercase">
              Brugerguide
            </p>
            <h1 className="text-5xl font-semibold tracking-[-0.045em] text-balance sm:text-6xl lg:text-7xl">
              Sådan bruger du appen
            </h1>
          </div>
          <div className="flex flex-col gap-4 xl:pb-1">
            <p className="text-lg leading-8 text-muted-foreground">
              Vælg en funktion. Hver side viser arbejdsgangen og de indstillinger,
              der styrer den.
            </p>
            <p className="text-sm leading-6 text-muted-foreground">
              Din rolle og organisationens opsætning bestemmer, hvilke funktioner
              du ser i appen.
            </p>
          </div>
        </div>
        <HelpOverviewVisual />
      </section>

      <section aria-labelledby="topics-title" className="mt-16 border-t pt-12 sm:mt-20 sm:pt-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold tracking-[0.14em] text-primary uppercase">
              Emner
            </p>
            <h2 id="topics-title" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Vælg en funktion
            </h2>
          </div>
          <Badge variant="outline">{helpFeatures.length} guider</Badge>
        </div>

        <div className="border-y divide-y">
          {helpFeatures.map((feature) => {
            const Icon = feature.icon;
            return (
              <Link
                key={feature.slug}
                href={`/help/${feature.slug}`}
                className="group grid min-h-28 gap-4 py-5 outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 sm:grid-cols-[3rem_3rem_minmax(12rem,0.55fr)_minmax(16rem,1fr)_auto] sm:items-center sm:px-4"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {feature.number}
                </span>
                <span className="grid size-11 place-items-center rounded-xl bg-muted text-primary group-hover:bg-background">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="text-lg font-semibold">{feature.label}</span>
                <span className="text-sm leading-6 text-muted-foreground">
                  {feature.summary}
                </span>
                <span className="flex items-center gap-3">
                  <Badge variant="secondary">
                    {feature.settings.length} indstillinger
                  </Badge>
                  <ArrowRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
