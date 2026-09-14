import type { HelpGuide } from "@/components/help/help-types";

const woltOrdersGuide: HelpGuide = {
  slug: "ordrer",
  label: "Find og læs en Wolt-ordre",
  summary:
    "Når Wolt er forbundet, kan du finde ordrer og læse produktlinjer, beløb og statushistorik. Her følger du en ordre fra listen til detaljerne.",
  appHref: "/wolt-orders",
  appLinkLabel: "Åbn Wolt-ordrer",
  sections: [
    {
      id: "find",
      title: "Find ordren",
      steps: [
        "Åbn Wolt-ordrer, og vælg Fra dato, Til dato og Lokation. Perioden må højst være 90 dage.",
        "Afgræns eventuelt med Status eller Ordretype, eller søg på Ordrenummer.",
        "Åbn ordren i listen. Brug Vis flere ordrer, hvis den ikke er på den første side.",
      ],
    },
    {
      id: "detaljer",
      title: "Læs ordredetaljerne",
      bullets: [
        "Kontrollér Netto kurv, antal Produkter, ordretype og status. Ordreoplysninger viser også bruttobeløb og tidspunkter for oprettelse og seneste opdatering.",
        "Hver produktlinje viser antal, stykpris, linjebeløb og det koblede lokale Produkt.",
        "Koblet for lokationen betyder, at koblingen er lokal. Ikke koblet eller Konflikt kræver kontrol af produktkoblingerne under Integrationer → Wolt.",
        "Statushistorik viser Wolt-status med både tidspunktet hos Wolt og tidspunktet, hvor appen modtog hændelsen.",
        "Visningen indeholder ikke forbrugeroplysninger. Ordredetaljer og statushistorik slettes efter 400 dage, selv om én søgning højst kan omfatte 90 dage.",
      ],
    },
    {
      id: "status",
      title: "Læs advarsler om manglende data",
      paragraphs: [
        "Advarsler kan vise lokationer uden forbindelse, uden nylig aktivitet, med godkendelsesfejl eller med hændelser, der venter eller er fejlet. Kontrollér disse lokationer under Integrationer → Wolt. Hvis koblingslisten er afkortet, kunne alle produktkoblinger ikke vurderes i ordredetaljerne.",
      ],
    },
  ],
  troubleshooting: [
    {
      question: "Hvorfor kan jeg ikke finde en ordre?",
      answer:
        "Ryd status-, ordretype- og nummerfiltre, og kontrollér periode og Lokation. Ved en ny SSIO-forbindelse skal du kontrollere med en ordre modtaget efter godkendelsen.",
    },
    {
      question: "Kan jeg behandle ordren her?",
      answer:
        "Wolt-ordrer bruges til at se ordrer og deres historik. Visningen har ingen handling til at acceptere, afvise eller refundere en ordre.",
    },
  ],
  relatedLinks: [
    {
      href: "/help/integrationer/wolt",
      label: "Wolt-forbindelser og produktkoblinger",
    },
  ],
};

export const woltGuide: HelpGuide = {
  integration: "wolt",
  slug: "wolt",
  label: "Wolt",
  summary:
    "Forbind Wolt pr. Lokation, kobl Wolt-produkter til produktkataloget, og kontrollér, at nye ordrer kommer ind.",
  appHref: "/administration/integrations/wolt",
  appLinkLabel: "Åbn Wolt-indstillinger",
  sections: [
    {
      id: "adgang",
      title: "Vælg forbindelsesmåde",
      bullets: [
        "Opret lokationer og Produkter først. Din rolle skal kunne administrere integrationer, og du skal have adgang til lokationen.",
        "SSIO forbinder en Lokation gennem godkendelse hos Wolt. Du kan bruge SSIO på de lokationer, du har adgang til.",
        "WIO bruger et partner-venue-id fra Wolt. WIO-opsætning, fælles produktkoblinger og aktivering af en allerede forbundet integration kræver adgang til alle lokationer.",
        "Integrationen læser ordredata. Den bruges ikke til at acceptere, annullere eller ændre ordrer hos Wolt.",
      ],
    },
    {
      id: "ssio",
      title: "Forbind med SSIO",
      steps: [
        "Åbn Administration → Integrationer → Wolt. Aktivér integrationen, og åbn dens indstillinger.",
        "Find lokationen, og vælg Start SSIO. Fuldfør godkendelsen hos Wolt for det rigtige salgssted.",
        "Når du vender tilbage, behandles godkendelsen, og status opdateres automatisk. Kontrollér lokationens forbindelsesstatus og Venue-id.",
        "Kontrollér forbindelsen med en ny ordre efter godkendelsen. SSIO henter nye events fra tilslutningen og importerer ikke automatisk tidligere ordrer.",
      ],
      screenshot: {
        src: "/help/screenshots/wolt-ordrer.webp",
        alt: "Wolt-indstillingerne for organisationen",
        caption:
          "Aktivér integrationen i oversigten, og åbn indstillingerne.",
        width: 1066,
        height: 74,
      },
    },
    {
      id: "wio",
      title: "Forbind med WIO",
      steps: [
        "Find den Lokation, Wolt har oprettet WIO-forbindelsen til.",
        "Indtast WIO partner-venue-id fra Wolt, og vælg Gem. En indtastet værdi er ikke gemt, før du trykker på knappen.",
        "Kontrollér forbindelsesstatus, når Wolt har sendt opsætningsdata. Et gemt partner-venue-id er koblingen til lokationen, ikke i sig selv bevis på en færdig forbindelse.",
      ],
    },
    {
      id: "produkter",
      title: "Kobl de observerede Wolt-produkter",
      steps: [
        "Find Observerede Wolt-produkter under forbindelserne. Produktlinjerne vises, når systemet har modtaget Wolt-ordrer.",
        "Filtrér eventuelt på Lokation. Kontrollér produktnavn og de viste id'er, og vælg det tilsvarende lokale Produkt.",
        "Vælg Gælder for. Brug Alle lokationer, når koblingen er fælles, eller en bestemt Lokation, når den skal gælde lokalt.",
        "Vælg Gem på produktlinjen. Kontrollér den gemte kobling ved at åbne en ordre med Produktet.",
      ],
      bullets: [
        "Navneforslag gemmes aldrig automatisk. Koblingen bruger den bedst tilgængelige identifikation i rækkefølgen GTIN, POS-id, SKU og navn.",
        "For samme id eller navn går en lokal kobling forud for en fælles kobling. Hvis du fjerner den lokale kobling, kan den fælles kobling blive brugt igen.",
        "Kun aktive lokale Produkter kan vælges. Opret et manglende Produkt under Administration → Produkter.",
      ],
    },
    {
      id: "status",
      title: "Kontrollér forbindelsen",
      steps: [
        "Åbn Wolt-ordrer, og find en ny ordre fra lokationen. Kontrollér produktkoblinger, beløb og statushistorik. Undersiden Find og læs en Wolt-ordre gennemgår ordredetaljerne.",
        "Gå tilbage til Integrationer for at kontrollere Seneste webhook, Seneste hentning, Kø, fejlede events og Seneste fejl for lokationen.",
      ],
      bullets: [
        "Webhook viser, hvornår Wolt sidst har meldt en ændring. Seneste hentning viser, hvornår systemet sidst har hentet ordredata. En tom kø betyder ikke, at der har været ordrer.",
        "Ved Godkendelse kræves skal du bruge Godkend SSIO igen. Når forbindelsen er Klar og fejlen er rettet, kan du vælge Prøv fejlede events igen.",
      ],
    },
    {
      id: "afbryd",
      title: "Sæt på pause eller afbryd",
      bullets: [
        "Deaktivér Wolt for at stoppe hentning af nye ordrer for organisationen. Ordrehistorikken bevares i op til 400 dage og vises, når integrationen aktiveres igen.",
        "Afbryd forbindelse stopper nye events for den valgte Lokation. Eksisterende ordredata og historik bevares inden for opbevaringsperioden.",
        "Fjern WIO-id fjerner koblingen til partner-venue-id'et. Nye WIO-events kan ikke kobles til lokationen, før et id er gemt igen.",
      ],
    },
  ],
  troubleshooting: [
    {
      question: "Lokationen er forbundet, men der er ingen ordrer",
      answer:
        "Kontrollér, at integrationen er aktiv, og at Venue-id tilhører den rigtige Lokation. Brug en ordre fra efter SSIO-godkendelsen, og fjern eventuelle ordre- og statusfiltre. Se derefter Seneste webhook, Seneste hentning og Seneste fejl.",
    },
    {
      question: "En produktkobling mangler på en ordre",
      answer:
        "Kontrollér, at du har valgt Gem, og at Gælder for omfatter ordren. Gennemgå også en eventuel lokal kobling for samme id eller navn. Hvis navne eller id'er er ændret hos Wolt, skal den nye observerede produktlinje kontrolleres.",
    },
    {
      question: "Prøv fejlede events igen er låst",
      answer:
        "Forbindelsen skal være Klar, og der skal være fejlede events. Løs Seneste fejl eller godkend forbindelsen igen først. Et nyt forsøg sætter de fejlede events i kø til behandling.",
    },
  ],
  relatedLinks: [
    {
      href: "/help/integrationer/wolt/ordrer",
      label: "Læs Wolt-ordrer og statushistorik",
    },
    { href: "/wolt-orders", label: "Åbn Wolt-ordrer" },
    { href: "/administration/products", label: "Administrér Produkter" },
    { href: "/help/count/overblik", label: "Brug Wolt som salgskilde i Count" },
  ],
  children: [woltOrdersGuide],
};

