import { ArrowRightIcon, SettingsIcon } from "lucide-react";
import Link from "next/link";
import { helpFeatures } from "@/components/help/help-features";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

export function HelpIndex() {
  return (
    <div className="flex flex-col gap-9 py-8 sm:gap-10 sm:py-12">
      <header className="flex max-w-2xl flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Hjælp til funktioner og opsætning
        </h1>
        <p className="text-base leading-7 text-muted-foreground">
          Vælg en funktion, og følg opsætningen trin for trin. Guiderne viser,
          hvad du skal have klar, hvor du finder indstillingerne, og hvordan du
          tjekker, at alt er klar til brug.
        </p>
      </header>

      <Alert role="note" className="p-4">
        <SettingsIcon aria-hidden="true" />
        <AlertTitle>Skal du sætte organisationen op?</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          <p>Start med lokationer, brugere og rettigheder i Administration.</p>
          <Link
            href="/help/administration"
            className="inline-flex min-h-11 items-center gap-2 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Se guiden til Administration
            <ArrowRightIcon className="size-4" aria-hidden="true" />
          </Link>
        </AlertDescription>
      </Alert>

      <section aria-labelledby="topics-title">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="topics-title" className="text-xl font-semibold tracking-tight">
            Vælg en funktion
          </h2>
          <Badge variant="outline">{helpFeatures.length} guider</Badge>
        </div>

        <ul className="divide-y border-y">
          {helpFeatures.map((feature) => {
            const Icon = feature.icon;
            return (
              <li key={feature.slug}>
                <Link
                  href={`/help/${feature.slug}`}
                  className="group grid min-h-24 grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2 py-5 outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 sm:items-center sm:px-3 xl:grid-cols-[1.25rem_minmax(9rem,0.4fr)_minmax(0,1fr)_auto]"
                >
                  <Icon className="mt-0.5 size-5 text-muted-foreground sm:mt-0" aria-hidden="true" />
                  <span className="font-semibold">{feature.label}</span>
                  <span className="col-start-2 row-start-2 text-sm leading-6 text-muted-foreground xl:col-start-3 xl:row-start-1">
                    {feature.summary}
                  </span>
                  <ArrowRightIcon className="col-start-3 row-start-1 mt-1 size-4 text-muted-foreground sm:mt-0 xl:col-start-4" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-5 text-sm leading-6 text-muted-foreground">
          Din rolle og organisationens opsætning bestemmer, hvilke funktioner og
          indstillinger du har adgang til.
        </p>
      </section>
    </div>
  );
}
