import { administrationFeatures } from "./help-administration-guides";
import { integrationFeature } from "./help-integrations";
import { operationFeatures } from "./help-operation-guides";
import type { HelpFeature } from "./help-types";

export const helpFeatures: HelpFeature[] = [
  ...administrationFeatures,
  integrationFeature,
  ...operationFeatures,
];

export const helpPages = helpFeatures.flatMap((feature) =>
  feature.guides.map((guide) => ({
    feature,
    guide,
    href: `/help/${feature.slug}/${guide.slug}`,
  })),
);

export function findHelpFeature(slug: string) {
  return helpFeatures.find((feature) => feature.slug === slug);
}
