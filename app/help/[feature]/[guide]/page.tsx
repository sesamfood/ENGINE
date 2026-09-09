import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { findHelpFeature, helpFeatures } from "@/components/help/help-features";
import { HelpGuidePage } from "@/components/help/help-guide-page";

type HelpGuideRouteProps = {
  params: Promise<{ feature: string; guide: string }>;
};

export function generateStaticParams() {
  return helpFeatures.flatMap((feature) =>
    feature.guides.map((guide) => ({
      feature: feature.slug,
      guide: guide.slug,
    })),
  );
}

export async function generateMetadata({
  params,
}: HelpGuideRouteProps): Promise<Metadata> {
  const { feature: featureSlug, guide: guideSlug } = await params;
  const feature = findHelpFeature(featureSlug);
  const guide = feature?.guides.find((item) => item.slug === guideSlug);
  if (!feature || !guide) return {};
  return {
    title:
      guide.slug === "overblik"
        ? `${feature.label} | Overblik | Hjælp`
        : `${guide.label} | ${feature.label} | Hjælp`,
    description: guide.summary,
  };
}

export default async function HelpGuideRoute({ params }: HelpGuideRouteProps) {
  const { feature: featureSlug, guide: guideSlug } = await params;
  if (featureSlug === "wolt-ordrer" && guideSlug === "find-ordre") {
    redirect("/help/integrationer/wolt-ordrer");
  }
  const feature = findHelpFeature(featureSlug);
  const guide = feature?.guides.find((item) => item.slug === guideSlug);
  if (!feature || !guide) notFound();
  return <HelpGuidePage feature={feature} guide={guide} />;
}
