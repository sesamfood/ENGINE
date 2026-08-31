import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  SettingsIcon,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  helpFeatures,
  type HelpFeature,
} from "@/components/help/help-features";
import { SettingsVisual } from "@/components/help/settings-visual";
import { cn } from "@/lib/utils";

export function HelpFeaturePage({ feature }: { feature: HelpFeature }) {
  const index = helpFeatures.findIndex((item) => item.slug === feature.slug);
  const previous = index > 0 ? helpFeatures[index - 1] : undefined;
  const next = index < helpFeatures.length - 1 ? helpFeatures[index + 1] : undefined;
  const Icon = feature.icon;
  const Visual = feature.visual;

  return (
    <article className="py-10 sm:py-16 lg:py-20">
      <header className="flex flex-col gap-6">
        <Link
          href="/help"
          className="inline-flex min-h-11 w-fit items-center gap-2 rounded-lg text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          Alle hjælpeemner
        </Link>
        <div className="grid gap-6 xl:grid-cols-[1fr_0.7fr] xl:items-end">
          <div className="flex flex-col items-start gap-4">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl bg-muted text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {feature.number}
              </span>
              <Badge variant="outline">{feature.label}</Badge>
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl lg:text-6xl">
              {feature.title}
            </h1>
          </div>
          <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
            {feature.summary}
          </p>
        </div>
      </header>

      <figure aria-label={feature.visualLabel} className="mt-10 sm:mt-14">
        <div aria-hidden="true">
          <Visual />
        </div>
        <figcaption className="mt-3 text-xs leading-5 text-muted-foreground">
          {feature.caption}
        </figcaption>
      </figure>

      <div className="mt-14 grid gap-10 border-t pt-12 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16">
        <section aria-labelledby="workflow-title">
          <p className="text-sm font-semibold tracking-[0.14em] text-primary uppercase">
            Arbejdsgang
          </p>
          <h2 id="workflow-title" className="mt-3 text-3xl font-semibold tracking-tight">
            Sådan gør du
          </h2>
          <ol className="mt-7 grid gap-5 sm:grid-cols-2">
            {feature.steps.map((step, stepIndex) => (
              <li key={step} className="grid grid-cols-[2.25rem_1fr] items-start gap-3">
                <span className="grid size-9 place-items-center rounded-full bg-muted font-mono text-xs font-semibold">
                  {stepIndex + 1}
                </span>
                <p className="pt-1.5 text-sm leading-6">{step}</p>
              </li>
            ))}
          </ol>
        </section>
        <aside className="flex flex-col items-start gap-5 border-l-2 border-primary pl-5 lg:self-start">
          <p className="text-sm leading-6 text-muted-foreground">{feature.note}</p>
          <Link
            href={feature.appHref}
            className={buttonVariants({
              variant: "outline",
              size: "lg",
              className: "min-h-11",
            })}
          >
            {feature.appLinkLabel}
            <ArrowUpRightIcon data-icon="inline-end" aria-hidden="true" />
          </Link>
        </aside>
      </div>

      <section
        aria-labelledby="settings-title"
        className="mt-16 border-t pt-12 sm:mt-20 sm:pt-16"
      >
        <div className="mb-8 grid gap-5 xl:grid-cols-[1fr_0.75fr] xl:items-end">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <SettingsIcon className="size-4" aria-hidden="true" />
              <p className="text-sm font-semibold tracking-[0.14em] uppercase">
                Indstillinger
              </p>
            </div>
            <h2 id="settings-title" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              {feature.settingsTitle}
            </h2>
          </div>
          <p className="text-base leading-7 text-muted-foreground">
            {feature.settingsIntro}
          </p>
        </div>

        <SettingsVisual settings={feature.settings} />

        <div className="mt-6 flex justify-end">
          <Link
            href={feature.settingsHref}
            className={buttonVariants({
              size: "lg",
              className: "min-h-11",
            })}
          >
            {feature.settingsLinkLabel}
            <ArrowUpRightIcon data-icon="inline-end" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <nav
        aria-label="Næste og forrige hjælpeemne"
        className="mt-16 grid gap-3 border-t pt-8 sm:grid-cols-2"
      >
        {previous ? (
          <Link
            href={`/help/${previous.slug}`}
            className="group flex min-h-20 items-center gap-3 rounded-xl border p-4 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ArrowLeftIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            <span>
              <span className="block text-xs text-muted-foreground">Forrige</span>
              <span className="mt-1 block font-semibold">{previous.label}</span>
            </span>
          </Link>
        ) : (
          <div />
        )}
        {next ? (
          <Link
            href={`/help/${next.slug}`}
            className={cn(
              "group flex min-h-20 items-center justify-between gap-3 rounded-xl border p-4 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
              "sm:col-start-2",
            )}
          >
            <span>
              <span className="block text-xs text-muted-foreground">Næste</span>
              <span className="mt-1 block font-semibold">{next.label}</span>
            </span>
            <ArrowRightIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          </Link>
        ) : null}
      </nav>
    </article>
  );
}
