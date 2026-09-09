import { administrationFeatures } from "./help-administration-guides";
import { integrationFeature } from "./help-integrations";
import { operationFeatures } from "./help-operation-guides";
import type { HelpFeature, HelpGuide } from "./help-types";

export const helpFeatures: HelpFeature[] = [
  ...administrationFeatures,
  integrationFeature,
  ...operationFeatures,
];

export type HelpPage = {
  feature: HelpFeature;
  guide: HelpGuide;
  href: string;
  parents: { href: string; label: string }[];
};

function flattenGuides(
  feature: HelpFeature,
  guides: HelpGuide[],
  baseHref: string,
  parents: HelpPage["parents"] = [],
): HelpPage[] {
  return guides.flatMap((guide) => {
    const href = `${baseHref}/${guide.slug}`;
    return [
      { feature, guide, href, parents },
      ...flattenGuides(feature, guide.children ?? [], href, [
        ...parents,
        { href, label: guide.label },
      ]),
    ];
  });
}

export const helpPages = helpFeatures.flatMap((feature) =>
  flattenGuides(feature, feature.guides, `/help/${feature.slug}`),
);

export function findHelpFeature(slug: string) {
  return helpFeatures.find((feature) => feature.slug === slug);
}
