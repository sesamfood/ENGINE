import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { helpPages } from "@/components/help/help-features";
import { HelpGuidePage } from "@/components/help/help-guide-page";

type HelpGuideRouteProps = {
  params: Promise<{ feature: string; guide: string[] }>;
};

export function generateStaticParams() {
  return helpPages.map((page) => ({
    feature: page.feature.slug,
    guide: page.href.split("/").slice(3),
  }));
}

export const metadata: Metadata = { title: "Hjælp" };

export default async function HelpGuideRoute({ params }: HelpGuideRouteProps) {
  const { feature: featureSlug, guide: guideSlug } = await params;
  const href = `/help/${featureSlug}/${guideSlug.join("/")}`;
  if (
    href === "/help/wolt-ordrer/find-ordre" ||
    href === "/help/integrationer/wolt-ordrer"
  ) {
    redirect("/help/integrationer/wolt/ordrer");
  }
  const page = helpPages.find((item) => item.href === href);
  if (!page) notFound();
  return <HelpGuidePage href={page.href} />;
}
