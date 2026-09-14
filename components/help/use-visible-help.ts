"use client";

import { useIntegrations } from "@/integrations/use-integrations";
import type { IntegrationId } from "@/integrations/registry";
import { helpFeatures, flattenGuides } from "./help-features";
import type { HelpGuide } from "./help-types";

export function useVisibleHelp() {
  const integrations = useIntegrations();
  const visible = (item: { integration?: IntegrationId }) =>
    !item.integration || integrations?.[item.integration] === true;
  function filterGuides(guides: HelpGuide[]): HelpGuide[] {
    return guides.filter(visible).map((guide) => ({
      ...guide,
      sections: guide.sections.filter(visible).map((section) => ({
        ...section,
        screenshot: section.screenshot && visible(section.screenshot) ? section.screenshot : undefined,
      })),
      troubleshooting: guide.troubleshooting?.filter(visible),
      relatedLinks: guide.relatedLinks?.filter(visible),
      children: guide.children ? filterGuides(guide.children) : undefined,
    }));
  }
  const features = helpFeatures.filter(visible).map((feature) => ({
    ...feature,
    guides: filterGuides(feature.guides),
  }));
  return {
    features,
    pages: features.flatMap((feature) => flattenGuides(feature, feature.guides, `/help/${feature.slug}`)),
  };
}
