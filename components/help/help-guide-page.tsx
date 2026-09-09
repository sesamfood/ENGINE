import Link from "next/link";
import { ArrowRightIcon, ArrowUpRightIcon } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { HelpFeature } from "./help-types";
import type { HelpGuide } from "./help-types";
import { HelpScreenshot } from "./help-screenshot";
import { HelpPagination } from "./help-pagination";
import { HelpGuideList } from "./help-guide-list";

export function HelpGuidePage({
  feature,
  guide,
}: {
  feature: HelpFeature;
  guide: HelpGuide;
}) {
  const isOverview = guide.slug === "overblik";

  return (
    <article className="flex max-w-4xl flex-col gap-9 py-6 sm:gap-10 sm:py-10">
      <header className="flex flex-col items-start gap-5">
        <Breadcrumb aria-label="Brødkrumme">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink
                render={<Link href="/help" />}
                className="inline-flex min-h-11 items-center rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Hjælp
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink
                render={<Link href={`/help/${feature.slug}/overblik`} />}
                className="inline-flex min-h-11 items-center rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {feature.label}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{guide.label}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex max-w-3xl flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {isOverview ? feature.label : guide.label}
          </h1>
          <p className="text-base leading-7 text-muted-foreground">
            {guide.summary}
          </p>
        </div>
        <Link
          href={guide.appHref}
          className={buttonVariants({
            variant: "outline",
            size: "lg",
            className: "min-h-11",
          })}
        >
          {guide.appLinkLabel}
          <ArrowUpRightIcon data-icon="inline-end" aria-hidden="true" />
        </Link>
        <nav
          aria-label="På denne side"
          className="flex flex-wrap gap-x-5 gap-y-1"
        >
          {[
            ...guide.sections.map((section) => ({
              id: section.id,
              title: section.title,
            })),
            ...(guide.troubleshooting?.length
              ? [{ id: "troubleshooting", title: "Spørgsmål og fejlfinding" }]
              : []),
          ].map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="inline-flex min-h-11 items-center rounded-sm text-sm text-muted-foreground underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {section.title}
            </a>
          ))}
        </nav>
      </header>
      <Separator />
      {guide.sections.map((section) => (
        <section
          key={section.id}
          id={section.id}
          aria-labelledby={`${section.id}-title`}
          className="scroll-mt-40 lg:scroll-mt-24"
        >
          <h2
            id={`${section.id}-title`}
            className="text-xl font-semibold tracking-tight sm:text-2xl"
          >
            {section.title}
          </h2>
          <div className="mt-4 flex max-w-3xl flex-col gap-4 text-sm leading-6">
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.steps?.length ? (
              <ol className="flex flex-col gap-4">
                {section.steps.map((step, stepIndex) => (
                  <li
                    key={step}
                    className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-3"
                  >
                    <span
                      aria-hidden="true"
                      className="grid size-8 place-items-center rounded-full border text-sm font-medium"
                    >
                      {stepIndex + 1}
                    </span>
                    <span className="pt-1">{step}</span>
                  </li>
                ))}
              </ol>
            ) : null}
            {section.bullets?.length ? (
              <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-muted-foreground">
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            ) : null}
          </div>
          {section.screenshot ? (
            <HelpScreenshot screenshot={section.screenshot} />
          ) : null}
        </section>
      ))}
      {isOverview ? <HelpGuideList feature={feature} /> : null}
      {guide.troubleshooting?.length ? (
        <section
          id="troubleshooting"
          aria-labelledby="troubleshooting-title"
          className="scroll-mt-40 lg:scroll-mt-24"
        >
          <h2
            id="troubleshooting-title"
            className="text-xl font-semibold tracking-tight sm:text-2xl"
          >
            Spørgsmål og fejlfinding
          </h2>
          <Accordion multiple className="mt-4">
            {guide.troubleshooting.map((item) => (
              <AccordionItem key={item.question} value={item.question}>
                <AccordionTrigger className="min-h-12 gap-4">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent>
                  <p className="max-w-3xl leading-6 text-muted-foreground">
                    {item.answer}
                  </p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      ) : null}
      {guide.relatedLinks?.length ? (
        <section aria-labelledby="related-title">
          <h2 id="related-title" className="text-lg font-semibold">
            Se også
          </h2>
          <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
            {guide.relatedLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex min-h-11 items-center gap-2 rounded-sm text-sm font-medium underline underline-offset-4 outline-none hover:no-underline focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {link.label}
                  <ArrowRightIcon className="size-4" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <Separator />
      <HelpPagination href={`/help/${feature.slug}/${guide.slug}`} />
    </article>
  );
}
