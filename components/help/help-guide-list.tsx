import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import type { HelpGuide } from "./help-types";

export function HelpGuideList({
  label,
  guides,
  baseHref,
}: {
  label: string;
  guides: HelpGuide[];
  baseHref: string;
}) {
  if (!guides.length) return null;

  return (
    <section
      id="guides"
      aria-labelledby="guides-title"
      className="scroll-mt-40 lg:scroll-mt-24"
    >
      <h2 id="guides-title" className="text-xl font-semibold tracking-tight">
        Læs videre om {label}
      </h2>
      <ul className="mt-4 grid gap-x-8 border-y sm:grid-cols-2">
        {guides.map((guide) => (
          <li
            key={guide.slug}
            className="border-b last:border-b-0 sm:border-b-0"
          >
            <Link
              href={`${baseHref}/${guide.slug}`}
              className="group flex h-full items-start justify-between gap-4 rounded-sm py-5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="flex flex-col gap-1.5">
                <span className="font-semibold group-hover:underline underline-offset-4">
                  {guide.label}
                </span>
                <span className="text-sm leading-6 text-muted-foreground">
                  {guide.summary}
                </span>
              </span>
              <ArrowRightIcon
                className="mt-1 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
