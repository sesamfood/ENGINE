import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  CheckIcon,
  InfoIcon,
  Maximize2Icon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  helpFeatures,
  type HelpFeature,
} from "@/components/help/help-features";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export function HelpFeaturePage({ feature }: { feature: HelpFeature }) {
  const index = helpFeatures.findIndex((item) => item.slug === feature.slug);
  const previous = index > 0 ? helpFeatures[index - 1] : undefined;
  const next = index < helpFeatures.length - 1 ? helpFeatures[index + 1] : undefined;
  const screenshot = feature.screenshot;

  return (
    <article className="flex flex-col gap-10 py-6 sm:gap-12 sm:py-10">
      <header className="flex flex-col items-start gap-5">
        <Link
          href="/help"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          Alle funktioner
        </Link>
        <div className="flex w-full flex-wrap items-start justify-between gap-5">
          <div className="flex max-w-2xl flex-col gap-3">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {feature.label}
            </h1>
            <p className="text-base leading-7 text-muted-foreground">
              {feature.summary}
            </p>
          </div>
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
        </div>
        <nav aria-label="På denne side" className="flex flex-wrap gap-x-2 gap-y-1">
          {[
            { href: "#before-you-start", label: "Før du går i gang" },
            { href: "#setup", label: "Opsætning" },
            { href: "#settings", label: "Indstillinger" },
            { href: "#check-setup", label: "Tjek opsætningen" },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={buttonVariants({
                variant: "secondary",
                size: "lg",
                className: "min-h-11",
              })}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      <Separator />

      <section
        id="before-you-start"
        aria-labelledby="prerequisites-title"
        className="scroll-mt-40 lg:scroll-mt-24"
      >
        <h2 id="prerequisites-title" className="text-xl font-semibold tracking-tight">
          Før du går i gang
        </h2>
        <ul className="mt-4 flex max-w-3xl list-disc flex-col gap-2 pl-5 text-sm leading-6 marker:text-muted-foreground">
          {feature.prerequisites.map((prerequisite) => (
            <li key={prerequisite}>{prerequisite}</li>
          ))}
        </ul>
      </section>

      <section
        id="setup"
        aria-labelledby="setup-title"
        className="scroll-mt-40 lg:scroll-mt-24"
      >
        <h2 id="setup-title" className="text-2xl font-semibold tracking-tight">
          {feature.title}
        </h2>
        <ol className="mt-6 flex max-w-3xl flex-col gap-7">
          {feature.steps.map((step, stepIndex) => (
            <li key={step} className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-3 sm:gap-4">
              <span aria-hidden="true" className="grid size-8 place-items-center rounded-full border text-sm font-medium">
                {stepIndex + 1}
              </span>
              <p className="pt-1 text-sm leading-6">{step}</p>
            </li>
          ))}
        </ol>
        <Link
          href={feature.settingsHref}
          className={buttonVariants({
            size: "lg",
            className: "mt-6 min-h-11",
          })}
        >
          {feature.settingsLinkLabel}
          <ArrowUpRightIcon data-icon="inline-end" aria-hidden="true" />
        </Link>

        <Alert role="note" className="mt-6 max-w-3xl p-4">
          <InfoIcon aria-hidden="true" />
          <AlertDescription>{feature.note}</AlertDescription>
        </Alert>

        {screenshot ? (
          <figure className="mt-8 w-full" style={{ maxWidth: screenshot.width }}>
            <a
              href={screenshot.src}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-xl border outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label={`${screenshot.alt}. Se i fuld størrelse i en ny fane`}
            >
              <Image
                src={screenshot.src}
                alt={screenshot.alt}
                width={screenshot.width}
                height={screenshot.height}
                sizes="(min-width: 1536px) 1216px, (min-width: 1024px) calc(100vw - 320px), (min-width: 640px) calc(100vw - 48px), calc(100vw - 32px)"
                className="h-auto w-full"
              />
            </a>
            <figcaption className="mt-2 flex flex-wrap items-start justify-between gap-x-6 gap-y-1">
              <p className="max-w-3xl py-2 text-xs leading-5 text-muted-foreground">
                {screenshot.caption}
              </p>
              <a
                href={screenshot.src}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-sm text-xs font-medium text-muted-foreground underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Maximize2Icon className="size-3.5" aria-hidden="true" />
                Se i fuld størrelse
                <span className="sr-only">i en ny fane</span>
              </a>
            </figcaption>
          </figure>
        ) : null}
      </section>

      <Separator />

      <section
        id="settings"
        aria-labelledby="settings-title"
        className="scroll-mt-40 lg:scroll-mt-24"
      >
        <div className="flex max-w-3xl flex-col gap-2">
          <h2 id="settings-title" className="text-2xl font-semibold tracking-tight">
            {feature.settingsTitle}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {feature.settingsIntro}
          </p>
        </div>
        <dl className="mt-6 grid gap-7 sm:grid-cols-2 xl:grid-cols-3">
          {feature.settings.map((setting) => (
            <div key={setting.title} className="flex flex-col gap-2">
              <dt className="font-semibold">{setting.title}</dt>
              <dd className="flex flex-col items-start gap-2">
                <p className="text-sm leading-6 text-muted-foreground">
                  {setting.description}
                </p>
                <Link
                  href={setting.href}
                  className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-sm text-sm font-medium text-primary underline underline-offset-4 outline-none hover:no-underline focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {setting.linkLabel}
                  <ArrowUpRightIcon className="size-4 shrink-0" aria-hidden="true" />
                </Link>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        id="check-setup"
        aria-labelledby="verification-title"
        className="scroll-mt-40 lg:scroll-mt-24"
      >
        <h2 id="verification-title" className="text-2xl font-semibold tracking-tight">
          Tjek opsætningen
        </h2>
        <ul className="mt-5 flex max-w-3xl flex-col gap-3">
          {feature.verification.map((check) => (
            <li key={check} className="flex items-start gap-3 text-sm leading-6">
              <CheckIcon className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span>{check}</span>
            </li>
          ))}
        </ul>
      </section>

      <Separator />

      <nav
        aria-label="Næste og forrige hjælpeemne"
        className="grid gap-3 sm:grid-cols-2"
      >
        {previous ? (
          <Link
            href={`/help/${previous.slug}`}
            className="flex min-h-20 items-center gap-3 rounded-xl border p-4 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ArrowLeftIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            <span>
              <span className="block text-xs text-muted-foreground">Forrige guide</span>
              <span className="mt-1 block font-semibold">{previous.label}</span>
            </span>
          </Link>
        ) : null}
        {next ? (
          <Link
            href={`/help/${next.slug}`}
            className="flex min-h-20 items-center justify-between gap-3 rounded-xl border p-4 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 sm:col-start-2"
          >
            <span>
              <span className="block text-xs text-muted-foreground">Næste guide</span>
              <span className="mt-1 block font-semibold">{next.label}</span>
            </span>
            <ArrowRightIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          </Link>
        ) : null}
      </nav>
    </article>
  );
}
