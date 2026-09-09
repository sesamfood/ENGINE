import { notFound, redirect } from "next/navigation";
import { findHelpFeature, helpFeatures } from "@/components/help/help-features";

type HelpFeatureRouteProps = {
  params: Promise<{ feature: string }>;
};

export function generateStaticParams() {
  return [
    ...helpFeatures.map((feature) => ({ feature: feature.slug })),
    { feature: "wolt-ordrer" },
  ];
}

export default async function HelpFeatureRoute({
  params,
}: HelpFeatureRouteProps) {
  const { feature: slug } = await params;
  if (slug === "wolt-ordrer") redirect("/help/integrationer/wolt");
  if (!findHelpFeature(slug)) notFound();
  redirect(`/help/${slug}/overblik`);
}
