import type { Metadata } from "next";
import { HelpIndex } from "@/components/help/help-index";

export const metadata: Metadata = {
  title: "Hjælp | ENGINE",
  description:
    "Find opsætningsguider til appens funktioner med skærmbilleder, trin for trin-vejledning og tjek af indstillingerne.",
};

export default function HelpRoute() {
  return <HelpIndex />;
}
