import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HelpFeaturePage } from "@/components/help/help-feature-page";
import {
  findHelpFeature,
  helpFeatures,
} from "@/components/help/help-features";

type HelpFeatureRouteProps = {
  params: Promise<{ feature: string }>;
};

export function generateStaticParams() {
  return helpFeatures.map((feature) => ({ feature: feature.slug }));
}

export async function generateMetadata({
  params,
}: HelpFeatureRouteProps): Promise<Metadata> {
  const { feature: slug } = await params;
  const feature = findHelpFeature(slug);

  if (!feature) return {};

  return {
    title: `${feature.label} | Hjælp | ENGINE`,
    description: feature.summary,
  };
}

export default async function HelpFeatureRoute({
  params,
}: HelpFeatureRouteProps) {
  const { feature: slug } = await params;
  const feature = findHelpFeature(slug);

  if (!feature) notFound();

  return <HelpFeaturePage feature={feature} />;
}
