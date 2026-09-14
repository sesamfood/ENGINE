import { PlugIcon } from "lucide-react";
import type { HelpFeature, HelpGuide } from "./help-types";

import { onlinePosGuide } from "@/integrations/onlinepos/help";
import { workfeedGuide } from "@/integrations/workfeed/help";
import { woltGuide } from "@/integrations/wolt/help";

const integrationOverview: HelpGuide = {
  slug: "overblik",
  label: "Overblik",
  summary:
    "Integrationer henter salg, ordrer og medarbejderdata fra de systemer, organisationen allerede bruger.",
  appHref: "/administration/integrations",
  appLinkLabel: "Åbn Integrationer",
  sections: [
    {
      id: "vaelg-integration",
      title: "Vælg den integration, I bruger",
      bullets: [
        "Åbn Administration → Integrationer. Aktivér den integration, organisationen vil bruge, og åbn dens indstillinger.",
        "Indtast organisationens egne nøgler. Guider og indstillinger for den enkelte integration vises, når den er aktiveret.",
      ],
    },
    {
      id: "foer-du-forbinder",
      title: "Klargør data og adgang først",
      paragraphs: [
        "Opret lokationer og de Produkter, der skal kobles til leverandørens data. Din rolle skal kunne administrere integrationer. Fælles opsætning kræver normalt adgang til alle lokationer. Hver integrationsguide beskriver de nødvendige adgangsoplysninger og rettigheder.",
      ],
    },
    {
      id: "kontroller",
      title: "Fra forbindelse til data i den daglige drift",
      paragraphs: [
        "Følg integrationens guide for at forbinde kontoen, tilknytte lokationer og kontrollere produkt- eller afdelingskoblinger. Sammenlign derefter en kendt ordre eller vagt med leverandørens system. Aktiv status alene viser ikke, om data er hentet og koblet korrekt.",
        "Deaktivering skjuler integrationen i appen og sætter opdateringer på pause. Fjernelse og kontoskift kan også slette koblinger eller historik. Følg vejledningen for den enkelte integration, før du ændrer forbindelsen.",
      ],
    },
  ],
  relatedLinks: [
    { href: "/help/administration/lokationer", label: "Klargør lokationer" },
    {
      href: "/help/administration/produkter",
      label: "Klargør produktkataloget",
    },
    {
      href: "/help/adgang-og-profil/brugere-og-roller",
      label: "Kontrollér roller og adgang",
    },
  ],
};

export const integrationFeature: HelpFeature = {
  slug: "integrationer",
  label: "Integrationer",
  summary:
    "Aktivér organisationens integrationer, og opsæt forbindelser med jeres egne nøgler.",
  icon: PlugIcon,
  guides: [
    integrationOverview,
    onlinePosGuide,
    workfeedGuide,
    woltGuide,
  ],
};
