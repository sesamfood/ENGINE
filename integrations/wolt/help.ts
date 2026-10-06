import type { HelpGuide } from "@/components/help/help-types";

const woltOrdersGuide: HelpGuide = {
  slug: "ordrer",
  label: "Find og læs en Wolt-ordre",
  summary:
    "Find Wolt-ordrer, og læs produktlinjer, beløb og statushistorik.",
  appHref: "/wolt-orders",
  appLinkLabel: "Åbn Wolt-ordrer",
  sections: [
    {
      id: "find",
      title: "Find ordren",
      steps: [
        "Åbn Wolt-ordrer, og vælg Fra dato, Til dato og Lokation. Perioden må højst være 90 dage.",
        "Afgræns eventuelt med Status, Ordretype eller Ordrenummer.",
        "Åbn ordren. Brug Vis flere ordrer, hvis den ikke er på første side.",
      ],
    },
    {
      id: "detaljer",
      title: "Ordredetaljer",
      bullets: [
        "Ordren viser Netto kurv, bruttobeløb, antal varer, ordretype, status og tidspunkter.",
        "Hver produktlinje viser antal, priser og det koblede lokale Produkt. Ikke koblet eller Konflikt kræver en produktkobling under Integrationer → Wolt.",
        "Statushistorik viser tidspunktet hos Wolt og tidspunktet, appen modtog ændringen.",
        "Visningen indeholder ingen forbrugeroplysninger. Ordrer gemmes i 400 dage.",
        "Advarsler peger på lokationer uden forbindelse, uden nylig aktivitet eller med fejl. Kontrollér dem under Integrationer → Wolt.",
      ],
    },
  ],
  troubleshooting: [
    {
      question: "Kan jeg acceptere eller afvise ordren her?",
      answer:
        "Nej. Wolt-ordrer viser kun ordrer og deres historik.",
    },
  ],
};

export const woltGuide: HelpGuide = {
  integration: "wolt",
  slug: "wolt",
  label: "Wolt",
  summary:
    "Forbind Wolt pr. Lokation, kobl Wolt-produkter til jeres Produkter, og kontrollér, at ordrer kommer ind.",
  appHref: "/administration/integrations/wolt",
  appLinkLabel: "Åbn Wolt-indstillinger",
  sections: [
    {
      id: "adgang",
      title: "Før du starter",
      bullets: [
        "Opret lokationer og Produkter. Din rolle skal kunne administrere integrationer.",
        "Integrationen læser ordredata. Den kan ikke acceptere, annullere eller ændre ordrer hos Wolt.",
        "Siden Wolt-ordrer slås til under Administration → Wolt-ordrer.",
      ],
    },
    {
      id: "noegler",
      title: "Gem organisationens Wolt-nøgler",
      steps: [
        "Åbn Administration → Integrationer → Wolt, og aktivér integrationen.",
        "Vælg Wolt-miljø, og angiv Klient-id, klienthemmelighed og webhook-hemmelighed fra Wolt. Ved WIO angiver du også WIO API-nøgle og WIO-returadresser.",
        "Vælg Gem Wolt-nøgler. Gemte nøgler vises ikke igen.",
      ],
    },
    {
      id: "ssio",
      title: "Forbind en Lokation med SSIO",
      steps: [
        "Vælg Start SSIO ved lokationen, og godkend det rigtige salgssted hos Wolt.",
        "Kontrollér forbindelsesstatus og Venue-id, når du vender tilbage.",
        "Kontrollér med en ny ordre. SSIO henter ikke ordrer fra før godkendelsen.",
      ],
    },
    {
      id: "wio",
      title: "Forbind en Lokation med WIO",
      steps: [
        "Indtast WIO partner-venue-id fra Wolt ved lokationen, og vælg Gem.",
        "Kontrollér forbindelsesstatus, når Wolt har sendt opsætningsdata.",
      ],
      bullets: [
        "WIO-opsætning og fælles produktkoblinger kræver adgang til alle lokationer.",
      ],
    },
    {
      id: "produkter",
      title: "Kobl Wolt-produkter",
      steps: [
        "Find Observerede Wolt-produkter. Listen fyldes, når der kommer ordrer.",
        "Vælg det lokale Produkt, og vælg Gælder for: Alle lokationer eller én Lokation. Vælg Gem.",
      ],
      bullets: [
        "Koblingen bruger GTIN, POS-id, SKU eller navn i den rækkefølge. Navneforslag gemmes ikke automatisk.",
        "En kobling for én Lokation går forud for en fælles kobling.",
      ],
    },
    {
      id: "status",
      title: "Kontrollér forbindelsen",
      bullets: [
        "Seneste webhook viser, hvornår Wolt sidst meldte en ændring. Seneste hentning viser, hvornår ordredata sidst blev hentet.",
        "Ved Godkendelse kræves vælger du Godkend SSIO igen. Når forbindelsen er Klar, kan du vælge Prøv fejlede events igen.",
      ],
    },
    {
      id: "afbryd",
      title: "Sæt på pause eller afbryd",
      bullets: [
        "Deaktivér integrationen for at stoppe nye ordrer. Historikken bevares.",
        "Afbryd forbindelse stopper nye ordrer for én Lokation. Fjern WIO-id fjerner koblingen til partner-venue-id'et.",
      ],
    },
  ],
  troubleshooting: [
    {
      question: "Lokationen er forbundet, men der er ingen ordrer",
      answer:
        "Kontrollér, at integrationen er aktiv, og at Venue-id tilhører lokationen. Brug en ordre fra efter godkendelsen, ryd filtrene, og se Seneste webhook og Seneste fejl.",
    },
    {
      question: "En ordrelinje er ikke koblet",
      answer:
        "Kontrollér, at koblingen er gemt, og at Gælder for omfatter lokationen. Har Wolt ændret navn eller id, skal den nye observerede linje kobles.",
    },
  ],
  relatedLinks: [
    { href: "/wolt-orders", label: "Åbn Wolt-ordrer" },
  ],
  children: [woltOrdersGuide],
};
