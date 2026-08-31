import type { Metadata } from "next";
import { HelpIndex } from "@/components/help/help-index";

export const metadata: Metadata = {
  title: "Hjælp | ENGINE",
  description:
    "Visuel guide til Dashboard, Transfer, Waste, Count, Staff food, Egenkontrol og Administration.",
};

export default function HelpRoute() {
  return <HelpIndex />;
}
