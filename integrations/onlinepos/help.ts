import type { HelpGuide } from "@/components/help/help-types";

export const onlinePosGuide: HelpGuide = {
  integration: "onlinepos",
  slug: "onlinepos",
  label: "OnlinePOS",
  summary:
    "Hent produktlister og salg fra OnlinePOS, kobl salget til jeres Produkter, og lad salget opdatere lageret.",
  appHref: "/administration/integrations/onlinepos",
  appLinkLabel: "Åbn OnlinePOS-indstillinger",
  sections: [
    {
      id: "data",
      title: "Masterforbindelser og lokationer",
      paragraphs: [
        "En masterforbindelse leverer produktlisten, som jeres Produkter kobles til. Hver Lokation har sin egen forbindelse, som leverer salg og ordrer. Har I flere OnlinePOS-produktlister, opretter du en masterforbindelse for hver og vælger, hvilken lokationen bruger.",
      ],
    },
    {
      id: "raekkefoelge",
      title: "Rækkefølge",
      steps: [
        "Forbind masterforbindelsen og lokationerne.",
        "Kobl Produkterne, og kontrollér en kendt ordre under Salg.",
        "Slå lagersynkronisering til, når koblinger, enheder og opskrifter er klar.",
      ],
    },
  ],
  children: [
    {
      slug: "forbindelser",
      label: "Forbind master og lokationer",
      summary:
        "Tilslut masterforbindelsen til produktlisten og hver Lokation til salg med dens eget firma-id og token.",
      appHref: "/administration/integrations/onlinepos",
      appLinkLabel: "Åbn OnlinePOS-indstillinger",
      sections: [
        {
          id: "foer-du-starter",
          title: "Før du starter",
          bullets: [
            "Du skal kunne administrere integrationer. Masterforbindelser og fælles lagerindstillinger kræver adgang til alle lokationer.",
            "Få firma-id og API-token til masterkontoen og til hver Lokations OnlinePOS-konto hos OnlinePOS.",
            "Opret lokationer og Produkter først.",
          ],
        },
        {
          id: "masterkonto",
          title: "Forbind masterforbindelsen",
          steps: [
            "Åbn Administration → Integrationer → OnlinePOS, og aktivér integrationen.",
            "Angiv Navn, Masterkontoens firma-id og Masterkontoens token under fanen Indstillinger, og vælg Forbind master.",
            "Brug Tilføj masterforbindelse, hvis I har flere produktlister.",
          ],
        },
        {
          id: "lokationer",
          title: "Forbind lokationerne",
          steps: [
            "Åbn lokationen under Lokationsindstillinger. Vælg masterforbindelse, angiv lokationens firma-id og token, og vælg Forbind.",
            "Gentag for hver Lokation. Filteret Kræver handling viser lokationer, der mangler opsætning.",
          ],
          bullets: [
            "Tokens gemmes på serveren og vises ikke igen.",
          ],
        },
      ],
      relatedLinks: [
        { integration: "onlinepos", href: "/help/integrationer/onlinepos/produktkoblinger", label: "Kobl Produkter" },
      ],
    },
    {
      slug: "produktkoblinger",
      label: "Kobl Produkter og opskrifter",
      summary:
        "Forbind OnlinePOS-produkter med jeres Produkter, så salg kan omregnes til forbrug.",
      appHref: "/administration/integrations/onlinepos",
      appLinkLabel: "Åbn OnlinePOS-indstillinger",
      sections: [
        {
          id: "produktkoblinger",
          title: "Kobl salget til jeres Produkter",
          steps: [
            "Åbn fanen Produktkoblinger. Vælg masterforbindelse og eventuelt Kategori.",
            "Find det lokale Produkt, og vælg det tilsvarende OnlinePOS-produkt. Valget gemmes med det samme.",
            "Brug Opdatér produkter, hvis OnlinePOS-listen er ændret. Kontrollér navneforslag, før du vælger dem.",
          ],
          bullets: [
            "Koblingen kan også vælges i produkteditoren.",
            "Koblinger opretter ikke Produkter. Opret manglende Produkter under Administration → Produkter.",
          ],
        },
        {
          id: "opskrifter",
          title: "Opskrifter, tilvalg og fravalg",
          paragraphs: [
            "Et solgt Produkt med opskrift trækker ingredienserne fra lageret. Kobl ingrediensernes tilvalg og fravalg i produkteditoren, og kontrollér mængder og enheder. En forkert kobling giver forkert forbrug og lager.",
          ],
        },
      ],
      troubleshooting: [
        {
          question: "Et Produkt mangler på koblingslisten",
          answer:
            "Kontrollér, at Produktet er aktivt, og ryd kategorifilteret. Listen viser højst 500 Produkter. Mangler OnlinePOS-produktet, så vælg Opdatér produkter og kontrollér masterforbindelsen.",
        },
      ],
      relatedLinks: [
        { href: "/help/administration/produkter", label: "Produkter og opskrifter" },
        { integration: "onlinepos", href: "/help/integrationer/onlinepos/lager", label: "Opdatér lageret fra salg" },
      ],
    },
    {
      slug: "salg",
      label: "Salg og synkronisering",
      summary:
        "Find gemte ordrer, og følg synkroniseringen for hver Lokation.",
      appHref: "/administration/integrations/onlinepos",
      appLinkLabel: "Åbn OnlinePOS-indstillinger",
      sections: [
        {
          id: "ordrer",
          title: "Find en ordre",
          steps: [
            "Åbn fanen Salg. Vælg Lokation og en periode på højst 31 dage.",
            "Åbn en kendt ordre, og sammenlign tidspunkt, omsætning, betaling og produktlinjer med OnlinePOS.",
          ],
        },
        {
          id: "synkronisering",
          title: "Synkronisering",
          bullets: [
            "Salg hentes hver fjerde time, eller hvert 10. minut når lagersynkronisering er slået til. Synkronisér nu henter med det samme.",
            "En ny forbindelse henter gradvist op til 90 dages historik. Historik tilbage til viser, hvor langt den er nået.",
            "Datofelterne filtrerer gemte ordrer. De starter ikke en ny import.",
            "Gemte salgslinjer viser de rå linjer til fejlsøgning. Kopiér dem, hvis support beder om det.",
          ],
        },
        {
          id: "historik",
          title: "Opbevaring",
          paragraphs: [
            "Ordredetaljer gemmes i 400 dage. Daglige salgstal bevares til Dashboard, så længe forbindelsen findes.",
          ],
        },
      ],
      troubleshooting: [
        {
          question: "Masterforbindelsen er forbundet, men der mangler salg",
          answer:
            "Salg kommer fra lokationernes egne forbindelser. Forbind Lokationen, og kontrollér, at integrationen er aktiv, og at perioden er hentet.",
        },
        {
          question: "Synkronisér nu kan ikke vælges",
          answer:
            "Integrationen skal være aktiv, og mindst én Lokation skal være forbundet. Knappen er også låst under en synkronisering og kort efter en manuel synkronisering.",
        },
      ],
      relatedLinks: [
        { href: "/help/dashboard/overblik", label: "Salg på Dashboard" },
        { href: "/help/count/lager-og-rapport", label: "Salg i Waste-rapporten efter Count" },
      ],
    },
    {
      slug: "lager",
      label: "Opdatér lageret fra salg",
      summary:
        "Lad salg trække fra lageret, og vælg, hvordan refunderinger behandles.",
      appHref: "/administration/integrations/onlinepos",
      appLinkLabel: "Åbn OnlinePOS-indstillinger",
      sections: [
        {
          id: "aktivering",
          title: "Slå lagersynkronisering til",
          steps: [
            "Kontrollér koblinger, enheder, opskrifter og salgshistorik.",
            "Åbn Indstillinger → Lagersynkronisering, og slå Opdatér lageret fra salg til. Valget gælder alle forbundne lokationer.",
            "Vælg, om refunderinger skal registreres som Waste. Ellers føres de tilbage på lageret.",
            "Vælg eventuelt Synkronisér med salg siden seneste Count, og bekræft med Aktivér.",
            "Kontrollér status og Senest gennemført pr. Lokation, og vælg Synkronisér igen efter en rettet fejl.",
          ],
        },
        {
          id: "beregning",
          title: "Sådan ændres lageret",
          bullets: [
            "Et Produkt med opskrift trækker ingredienserne. Andre Produkter trækker sig selv. Tilvalg og fravalg følger koblingerne.",
            "Synkronisering siden Count starter ved hvert Produkts seneste Count. Produkter uden Count starter fra nu. Salg trækkes aldrig fra to gange.",
            "Ændring af refunderingsvalget gælder kun refunderinger, der behandles fremover.",
            "Slår du synkroniseringen fra, stopper nye lagerændringer. Tidligere ændringer bevares.",
          ],
        },
      ],
      relatedLinks: [
        { href: "/help/count/overblik", label: "Count" },
      ],
    },
    {
      slug: "vedligeholdelse",
      label: "Skift token, sæt på pause eller fjern",
      summary:
        "Opdatér forbindelser, og kend følgerne, før du fjerner dem.",
      appHref: "/administration/integrations/onlinepos",
      appLinkLabel: "Åbn OnlinePOS-indstillinger",
      sections: [
        {
          id: "token",
          title: "Nyt token eller navn",
          paragraphs: [
            "Åbn masterforbindelsen, ret Navn eller angiv Nyt token til masterkontoen, og vælg Gem ændringer. En Lokation får nyt token i feltet Nyt token.",
          ],
        },
        {
          id: "pause",
          title: "Sæt på pause",
          paragraphs: [
            "Deaktivér integrationen for at stoppe synkroniseringen og beholde opsætningen.",
          ],
        },
        {
          id: "fjern",
          title: "Fjern en forbindelse",
          bullets: [
            "Fjern forbindelse på en Lokation sletter tokenet og lokationens gemte OnlinePOS-salg og daglige salgstal. Rapporter og dashboards ændres.",
            "Fjern forbindelse på en masterforbindelse sletter dens token, produktkoblinger og menuer. Flyt først lokationerne til en anden masterforbindelse.",
            "Skift af firma-id på en Lokation nulstiller dens salgshistorik.",
          ],
        },
      ],
    },
  ],
};
