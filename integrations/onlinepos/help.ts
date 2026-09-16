import type { HelpGuide } from "@/components/help/help-types";

export const onlinePosGuide: HelpGuide = {
  integration: "onlinepos",
  slug: "onlinepos",
  label: "OnlinePOS",
  summary:
    "Forbind produktkatalog og salg fra OnlinePOS. Kobl salget til jeres Produkter, og vælg, om det også skal opdatere lageret.",
  appHref: "/administration/integrations/onlinepos",
  appLinkLabel: "Åbn OnlinePOS-indstillinger",
  sections: [
    {
      id: "data",
      title: "Produktliste, salg og lager",
      paragraphs: [
        "Masterkontoen leverer produktlisten til koblinger. Hver Lokations egen forbindelse leverer salg og ordrehistorik. Produktkoblingerne forbinder salget med jeres produktkatalog, så det kan bruges i rapporter og valgfri lagersynkronisering.",
      ],
    },
    {
      id: "raekkefoelge",
      title: "Start med forbindelserne",
      paragraphs: [
        "Forbind først masterkontoen og lokationerne. Kobl derefter Produkter, og kontrollér en kendt ordre under Salg. Slå først lagersynkronisering til, når koblinger, enheder og opskrifter er klar.",
        "Undersiderne følger denne rækkefølge. Den sidste guide beskriver, hvordan du skifter token, sætter synkronisering på pause eller fjerner en forbindelse.",
      ],
    },
  ],
  children: [
    {
      slug: "forbindelser",
      label: "Forbind masterkonto og lokationer",
      summary:
        "Tilslut masterkontoen til produktlisten og hver Lokation til salg med dens eget firma-id og token.",
      appHref: "/administration/integrations/onlinepos",
      appLinkLabel: "Åbn OnlinePOS-indstillinger",
      sections: [
        {
          id: "foer-du-starter",
          title: "Hav konti og Produkter klar",
          bullets: [
            "Du skal kunne administrere integrationer. Masterforbindelsen, aktivering og fælles lagerindstillinger kræver adgang til alle lokationer.",
            "Få firma-id og API-token til masterkontoen samt til hver Lokations OnlinePOS-konto. Kontakt OnlinePOS, hvis I mangler oplysningerne eller API-adgang.",
            "Opret lokationer og lokale Produkter i Administration. Kontrollér enheder og opskrifter, før du lader salg ændre lageret.",
          ],
        },
        {
          id: "masterkonto",
          title: "Forbind masterkontoen",
          steps: [
            "Åbn Administration → Integrationer → OnlinePOS. Brug kontakten til at åbne opsætningen, og udfyld Masterkontoens firma-id og Masterkontoens token.",
            "Vælg Forbind master. Masterkontoen henter produktlisten til koblinger. Den henter ikke lokationernes salg.",
          ],
        },
        {
          id: "lokationer",
          title: "Forbind lokationerne",
          steps: [
            "Vælg Vis ved Lokationsindstillinger under fanen Indstillinger. Angiv firma-id og token fra den enkelte Lokations OnlinePOS-konto, og vælg Forbind. Gentag for de lokationer, der skal levere salg.",
            "Kontrollér, at integrationen er aktiv, og at de rigtige lokationer er forbundet. Tokens kan ikke vises igen efter lagring.",
          ],
        },
      ],
      relatedLinks: [
        { href: "/help/administration/lokationer", label: "Klargør lokationer" },
        { integration: "onlinepos", href: "/help/integrationer/onlinepos/salg", label: "Kontrollér de første salg" },
        { integration: "onlinepos", href: "/help/integrationer/onlinepos/vedligeholdelse", label: "Skift token eller konto" },
      ],
    },
    {
      slug: "produktkoblinger",
      label: "Kobl Produkter og opskrifter",
      summary:
        "Forbind OnlinePOS-produkter med jeres produktkatalog, så salg kan omsættes til forbrug og lagerændringer.",
      appHref: "/administration/integrations/onlinepos",
      appLinkLabel: "Åbn OnlinePOS-indstillinger",
      sections: [
        {
          id: "forberedelse",
          title: "Forbind masterkontoen først",
          paragraphs: [
            "Masterkontoen skal være forbundet, og OnlinePOS skal være aktiv. Opret jeres lokale Produkter i Administration, før du vælger koblingerne.",
          ],
        },
        {
          id: "produktkoblinger",
          title: "Kobl salget til jeres Produkter",
          steps: [
            "Åbn fanen Produktkoblinger under Administration → Integrationer → OnlinePOS. Find det lokale Produkt, søg i OnlinePOS-listen, og vælg det tilsvarende OnlinePOS-produkt. Valget gemmes med det samme.",
            "Brug Opdatér produkter, hvis OnlinePOS-listen er ændret. Kontrollér forslag ud fra navnet, før du vælger dem.",
          ],
          bullets: [
            "Koblingen forbinder eksisterende Produkter. Den opretter ikke automatisk et lokalt produktkatalog.",
          ],
        },
        {
          id: "opskrifter",
          title: "Kontrollér opskrifter, tilvalg og fravalg",
          steps: [
            "Gennemgå opskrifter, tilvalg og fravalg under Administration → Produkter. Angiv de relevante OnlinePOS-koblinger på ingrediensernes tilføjelser og fravalg.",
          ],
          bullets: [
            "En forkert kobling kan give forkerte beregninger af forbrug og lager. Kontrollér også mængder og enheder i opskriften.",
          ],
        },
      ],
      troubleshooting: [
        {
          question: "Et Produkt mangler på koblingslisten",
          answer:
            "Kontrollér, at det lokale Produkt er aktivt, og vælg Opdatér produkter for at hente masterlisten igen. Visningen viser højst 500 lokale Produkter og giver besked, hvis listen er afkortet. Hvis OnlinePOS-listen ikke kan hentes, skal masterforbindelsen kontrolleres.",
        },
      ],
      relatedLinks: [
        { href: "/help/administration/produkter", label: "Produkter, enheder, opskrifter og menuer" },
        { href: "/administration/products", label: "Åbn produktkataloget" },
        { integration: "onlinepos", href: "/help/integrationer/onlinepos/forbindelser", label: "Forbind masterkontoen" },
        { integration: "onlinepos", href: "/help/integrationer/onlinepos/lager", label: "Lad salg opdatere lageret" },
      ],
    },
    {
      slug: "salg",
      label: "Læs salg og ordrehistorik",
      summary:
        "Find gemte ordrer, kontrollér den hentede periode, og følg synkroniseringen for hver Lokation.",
      appHref: "/administration/integrations/onlinepos",
      appLinkLabel: "Åbn OnlinePOS-indstillinger",
      sections: [
        {
          id: "ordrer",
          title: "Find og kontrollér en ordre",
          steps: [
            "Åbn fanen Salg under Administration → Integrationer → OnlinePOS. Vælg Lokation og en periode på højst 31 dage. Begge valgte datoer tæller med, og datoerne følger organisationens tidszone.",
            "Åbn en kendt ordre. Sammenlign tidspunkt, omsætning, betaling, produktlinjer og eventuelle menuindhold med OnlinePOS.",
          ],
        },
        {
          id: "synkronisering",
          title: "Følg synkroniseringen",
          steps: [
            "Kontrollér Senest synkroniseret, Historik tilbage til og Aktuel til for lokationen. Brug Synkronisér nu, hvis der skal hentes nye data.",
          ],
          bullets: [
            "Den normale salgssynkronisering kører hver fjerde time. Med lagersynkronisering hentes salg hvert 10. minut.",
            "Ved tilslutning henter systemet gradvist historik op til 90 dage tilbage. Den viste historikdato fortæller, hvor langt det er nået.",
            "Synkronisér nu henter data i baggrunden. Datofelterne filtrerer den gemte historik og bestiller ikke en særskilt import af den valgte periode.",
          ],
        },
        {
          id: "historik",
          title: "Hvor længe gemmes salget?",
          paragraphs: [
            "Ordredetaljer gemmes i 400 dage. Daglige salgstal bevares til dashboardets historik, så længe forbindelsen ikke fjernes.",
          ],
        },
      ],
      troubleshooting: [
        {
          question: "Masterkontoen er forbundet, men der mangler salg",
          answer:
            "Forbind også den enkelte Lokation med dens eget firma-id og token. Kontrollér derefter integrationskontakten, status under Salg og om den valgte periode er hentet. Ingen synkroniserede data endnu betyder, at perioden ikke er dækket. Ingen ordrer i perioden betyder, at den hentede periode er tom.",
        },
        {
          question: "Synkronisér nu kan ikke vælges",
          answer:
            "Kontrollér, at integrationen er aktiv, og at mindst én Lokation er forbundet. Knappen er også låst, mens en synkronisering kører, eller mens manuel synkronisering er midlertidigt begrænset. Siden viser, hvornår du kan prøve igen.",
        },
        {
          question: "Hvad er Rå salgsrespons?",
          answer:
            "Det er en kontrol af de første fem rå salgslinjer fra masterkontoens OnlinePOS-adgang for én dag. Hent og Kopiér kan bruges ved fejlsøgning med support. Brug fanen Salg til lokationernes normale ordrehistorik.",
        },
      ],
      relatedLinks: [
        { integration: "onlinepos", href: "/help/integrationer/onlinepos/forbindelser", label: "Kontrollér lokationsforbindelser" },
        { integration: "onlinepos", href: "/help/integrationer/onlinepos/produktkoblinger", label: "Kontrollér produktkoblinger" },
        { href: "/help/dashboard/overblik", label: "Vis salg på Dashboard" },
        { href: "/help/count/lager-og-rapport", label: "Brug salg i Count-rapporten" },
      ],
    },
    {
      slug: "lager",
      label: "Opdatér lageret fra salg",
      summary:
        "Vælg, hvordan salg og refunderinger ændrer lageret, og afstem eventuelt siden seneste Count.",
      appHref: "/administration/integrations/onlinepos",
      appLinkLabel: "Åbn OnlinePOS-indstillinger",
      sections: [
        {
          id: "forberedelse",
          title: "Kontrollér grundlaget først",
          paragraphs: [
            "OnlinePOS skal være aktivt, og de relevante lokationer skal være forbundet. Kontrollér produktkoblinger, enheder, opskrifter og salgshistorik, før du aktiverer lagerændringer. Fælles lagerindstillinger kræver adgang til alle lokationer og ret til at administrere integrationer.",
          ],
        },
        {
          id: "aktivering",
          title: "Slå lagersynkronisering til",
          steps: [
            "Åbn Indstillinger → Lagersynkronisering under Administration → Integrationer → OnlinePOS, og slå Opdatér lageret fra salg til. Valget gælder alle forbundne lokationer.",
            "Vælg, om refunderinger skal registreres som Waste. Uden dette valg føres refunderede mængder tilbage på lageret.",
            "Vælg eventuelt Synkronisér med salg siden seneste Count. Ellers ændrer kun salg fra aktiveringstidspunktet lageret. Bekræft med Aktivér.",
            "Kontrollér status og Senest gennemført pr. Lokation. Ret eventuelle fejl, og vælg Synkronisér igen.",
          ],
        },
        {
          id: "beregning",
          title: "Sådan ændres beholdningen",
          bullets: [
            "Salg af et Produkt med opskrift reducerer ingrediensernes lager. Andre Produkter reducerer deres egen beholdning. Tilvalg og fravalg bruger de gemte koblinger.",
            "Synkronisering siden Count starter ved hvert Produkts seneste Count på lokationen. Produkter uden Count starter fra nu. Tidligere behandlede salg trækkes ikke fra igen.",
            "Manglende salgshistorik kan blokere afstemning siden Count. Kontrollér først historikdatoerne under Salg.",
            "Valget om Waste gælder refunderinger, der behandles efter ændringen, også historiske refunderinger, du vælger at hente siden Count. Allerede behandlede refunderinger ændres ikke. Ret fejl i OnlinePOS.",
          ],
        },
        {
          id: "aendringer",
          title: "Ændr refunderinger eller stop lageropdateringer",
          bullets: [
            "Brug Registrér refunderinger som Waste under Lagersynkronisering, hvis refunderinger fremover skal behandles anderledes.",
            "Slå Opdatér lageret fra salg fra for at stoppe nye lageropdateringer. Tidligere lagerændringer bevares.",
          ],
        },
      ],
      relatedLinks: [
        { integration: "onlinepos", href: "/help/integrationer/onlinepos/produktkoblinger", label: "Kontrollér Produkter og opskrifter" },
        { integration: "onlinepos", href: "/help/integrationer/onlinepos/salg", label: "Kontrollér salgshistorikken" },
        { href: "/help/count/overblik", label: "Count og forbrugsrapport" },
        { href: "/help/waste/overblik", label: "Waste og lagerfradrag" },
      ],
    },
    {
      slug: "vedligeholdelse",
      label: "Skift token, sæt på pause eller fjern",
      summary:
        "Vedligehold forbindelserne, og kontrollér følgerne for salgshistorik og produktkoblinger, før du skifter konto eller fjerner en forbindelse.",
      appHref: "/administration/integrations/onlinepos",
      appLinkLabel: "Åbn OnlinePOS-indstillinger",
      sections: [
        {
          id: "token",
          title: "Skift masterkontoens token",
          steps: [
            "Åbn Administration → Integrationer → OnlinePOS → Indstillinger. Brug Skift token på masterforbindelsen for at udskifte adgangsoplysningerne til samme konto.",
            "Udfyld Nyt token til masterkontoen, og vælg Gem nyt token. Kontrollér forbindelsesstatus efter ændringen.",
          ],
        },
        {
          id: "pause",
          title: "Sæt synkroniseringen på pause",
          paragraphs: [
            "Deaktivér integrationen for at stoppe nye synkroniseringer og beholde opsætningen. Deaktivering af lagersynkronisering bevarer tidligere lagerændringer.",
          ],
        },
        {
          id: "fjern",
          title: "Læs følgerne, før du fjerner en forbindelse",
          bullets: [
            "Fjerner du en lokationsforbindelse, slettes tokenet og lokationens gemte OnlinePOS-salg, produktlinjer og daglige salgstal her i systemet. Det påvirker også rapporter og dashboards.",
            "Fjern forbindelse på masterkontoen sletter desuden alle lokationstokens, produktkoblinger og gemte OnlinePOS-menuer. Skift af firma-id på en Lokation nulstiller også dens salgshistorik, før data fra den nye konto hentes.",
          ],
        },
      ],
      relatedLinks: [
        { integration: "onlinepos", href: "/help/integrationer/onlinepos/forbindelser", label: "Forbind masterkonto og lokationer" },
        { integration: "onlinepos", href: "/help/integrationer/onlinepos/salg", label: "Kontrollér salg og historik" },
        { integration: "onlinepos", href: "/help/integrationer/onlinepos/lager", label: "Indstillinger for lageropdatering" },
      ],
    },
  ],
};
