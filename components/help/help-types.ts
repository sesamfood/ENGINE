import type { IntegrationId } from "@/integrations/registry";
import type { LucideIcon } from "lucide-react";

export type HelpFeature = {
  integration?: IntegrationId;
  slug: string;
  label: string;
  summary: string;
  icon: LucideIcon;
  guides: HelpGuide[];
};

export type HelpScreenshot = {
  integration?: IntegrationId;
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
};

export type HelpGuide = {
  integration?: IntegrationId;
  slug: string;
  label: string;
  summary: string;
  appHref: string;
  appLinkLabel: string;
  children?: HelpGuide[];
  sections: {
    integration?: IntegrationId;
    id: string;
    title: string;
    paragraphs?: string[];
    steps?: string[];
    bullets?: string[];
    screenshot?: HelpScreenshot;
  }[];
  troubleshooting?: { integration?: IntegrationId; question: string; answer: string }[];
  relatedLinks?: { integration?: IntegrationId; href: string; label: string }[];
};
