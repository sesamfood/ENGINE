import { PlugIcon } from "lucide-react";
import type { HelpFeature, HelpGuide } from "./help-types";

import { economicGuide } from "@/integrations/economic/help";
import { onlinePosGuide } from "@/integrations/onlinepos/help";
import { workfeedGuide } from "@/integrations/workfeed/help";
import { woltGuide } from "@/integrations/wolt/help";

const integrationOverview: HelpGuide = {
  slug: "overblik",
  label: "Overblik",
  summary:
    "Integrationer henter salg, ordrer, vagter og regnskabstal fra de systemer, organisationen allerede bruger.",
  appHref: "/administration/integrations",
  appLinkLabel: "Åbn Integrationer",
  sections: [
    {
      id: "vaelg-integration",
      title: "Aktivér en integration",
      steps: [
        "Åbn Administration → Integrationer, og aktivér integrationen med kontakten.",
        "Åbn integrationen, og indtast organisationens egne adgangsoplysninger.",
        "Følg integrationens guide for at koble lokationer, Produkter eller konti.",
      ],
      bullets: [
        "Guider til en integration vises her, når den er aktiveret.",
      ],
    },
    {
      id: "foer-du-forbinder",
      title: "Før du forbinder",
      paragraphs: [
        "Opret lokationer og Produkter først. Din rolle skal kunne administrere integrationer, og fælles opsætning kræver normalt adgang til alle lokationer.",
      ],
    },
    {
      id: "kontroller",
      title: "Kontrollér og vedligehold",
      bullets: [
        "Sammenlign en kendt ordre, vagt eller postering med leverandørens system. Status Aktiv viser ikke, om data er koblet korrekt.",
        "Deaktivering skjuler integrationen og stopper nye opdateringer. Adgangsoplysninger, koblinger og historik bevares.",
        "Fjernelse eller skift af konto kan slette koblinger og historik. Læs integrationens guide først.",
      ],
    },
  ],
  relatedLinks: [
    { href: "/help/administration/lokationer", label: "Klargør lokationer" },
    { href: "/help/administration/produkter", label: "Klargør Produkter" },
  ],
};

export const integrationFeature: HelpFeature = {
  slug: "integrationer",
  label: "Integrationer",
  summary:
    "Forbind salg, vagtplaner, ordrer og regnskab med organisationens egne nøgler.",
  icon: PlugIcon,
  guides: [
    integrationOverview,
    onlinePosGuide,
    workfeedGuide,
    woltGuide,
    economicGuide,
  ],
};
