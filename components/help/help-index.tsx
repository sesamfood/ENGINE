import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { helpFeatures, helpPages } from "./help-features";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export function HelpIndex() {
  return (
    <div className="flex max-w-5xl flex-col gap-10 py-8 sm:gap-12 sm:py-12">
      <header className="flex max-w-2xl flex-col items-start gap-4">
        <p className="text-sm font-medium text-muted-foreground">
          Opsætning og daglig brug
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Hjælp til hele driften
        </h1>
        <p className="text-base leading-7 text-muted-foreground">
          Start med organisationens opsætning, og følg guiderne frem til den
          daglige drift. Du kan også vælge en funktion herunder eller søge efter
          en bestemt opgave.
        </p>
        <Link
          href={helpPages[0]?.href ?? "/help/administration/overblik"}
          className={buttonVariants({ size: "lg", className: "min-h-11" })}
        >
          Læs fra begyndelsen
          <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
        </Link>
      </header>

      <section aria-labelledby="topics-title">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
          <h2
            id="topics-title"
            className="text-xl font-semibold tracking-tight"
          >
            Find din funktion
          </h2>
          <p className="text-sm text-muted-foreground">
            Overblik, opsætning og brug i hvert emne
          </p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {helpFeatures.map((feature) => {
            const Icon = feature.icon;
            const guideCount = helpPages.filter(
              (page) =>
                page.feature.slug === feature.slug &&
                page.guide.slug !== "overblik",
            ).length;
            return (
              <li key={feature.slug}>
                <Link
                  href={`/help/${feature.slug}/overblik`}
                  className="group block h-full rounded-xl outline-none transition-shadow hover:ring-2 hover:ring-primary/30 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Card className="h-full gap-4 py-5">
                    <CardHeader className="gap-3">
                      <div className="flex items-center justify-between gap-4">
                        <Icon
                          className="size-5 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <ArrowRightIcon
                          className="size-4 text-muted-foreground transition-transform motion-safe:group-hover:translate-x-1"
                          aria-hidden="true"
                        />
                      </div>
                      <CardTitle>
                        <h3>{feature.label}</h3>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col gap-4">
                      <p className="text-sm leading-6 text-muted-foreground">
                        {feature.summary}
                      </p>
                      <p className="mt-auto text-xs text-muted-foreground">
                        Overblik og {guideCount}{" "}
                        {guideCount === 1 ? "guide" : "guider"}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
      <p className="max-w-2xl border-t pt-6 text-sm leading-6 text-muted-foreground">
        Din rolle og organisationens opsætning bestemmer, hvilke funktioner du
        kan bruge. Hvert emne starter med et overblik. Brug Næste nederst på
        siderne for at læse videre i rækkefølge.
      </p>
    </div>
  );
}
