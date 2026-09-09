import type { LucideIcon } from "lucide-react";

export type HelpFeature = {
  slug: string;
  label: string;
  summary: string;
  icon: LucideIcon;
  guides: HelpGuide[];
};

export type HelpScreenshot = {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
};

export type HelpGuide = {
  slug: string;
  label: string;
  summary: string;
  appHref: string;
  appLinkLabel: string;
  children?: HelpGuide[];
  sections: {
    id: string;
    title: string;
    paragraphs?: string[];
    steps?: string[];
    bullets?: string[];
    screenshot?: HelpScreenshot;
  }[];
  troubleshooting?: { question: string; answer: string }[];
  relatedLinks?: { href: string; label: string }[];
};
