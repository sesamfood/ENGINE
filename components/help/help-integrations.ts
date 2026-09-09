import { PlugIcon } from "lucide-react";
import type { HelpFeature, HelpGuide } from "./help-types";

const onlinePosGuide: HelpGuide = {
  slug: "onlinepos",
  label: "OnlinePOS",
  summary:
    "Forbind produktkatalog og salg fra OnlinePOS. Kobl salget til jeres Produkter, og vælg, om det også skal opdatere lageret.",
  appHref: "/administration/integrations",
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
      appHref: "/administration/integrations",
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
        { href: "/help/integrationer/onlinepos/salg", label: "Kontrollér de første salg" },
        { href: "/help/integrationer/onlinepos/vedligeholdelse", label: "Skift token eller konto" },
      ],
    },
    {
      slug: "produktkoblinger",
      label: "Kobl Produkter og opskrifter",
      summary:
        "Forbind OnlinePOS-produkter med jeres produktkatalog, så salg kan omsættes til forbrug og lagerændringer.",
      appHref: "/administration/integrations",
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
        { href: "/help/integrationer/onlinepos/forbindelser", label: "Forbind masterkontoen" },
        { href: "/help/integrationer/onlinepos/lager", label: "Lad salg opdatere lageret" },
      ],
    },
    {
      slug: "salg",
      label: "Læs salg og ordrehistorik",
      summary:
        "Find gemte ordrer, kontrollér den hentede periode, og følg synkroniseringen for hver Lokation.",
      appHref: "/administration/integrations",
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
        { href: "/help/integrationer/onlinepos/forbindelser", label: "Kontrollér lokationsforbindelser" },
        { href: "/help/integrationer/onlinepos/produktkoblinger", label: "Kontrollér produktkoblinger" },
        { href: "/help/dashboard/overblik", label: "Vis salg på Dashboard" },
        { href: "/help/count/lager-og-rapport", label: "Brug salg i Count-rapporten" },
      ],
    },
    {
      slug: "lager",
      label: "Opdatér lageret fra salg",
      summary:
        "Vælg, hvordan salg og refunderinger ændrer lageret, og afstem eventuelt siden seneste Count.",
      appHref: "/administration/integrations",
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
        { href: "/help/integrationer/onlinepos/produktkoblinger", label: "Kontrollér Produkter og opskrifter" },
        { href: "/help/integrationer/onlinepos/salg", label: "Kontrollér salgshistorikken" },
        { href: "/help/count/overblik", label: "Count og forbrugsrapport" },
        { href: "/help/waste/overblik", label: "Waste og lagerfradrag" },
      ],
    },
    {
      slug: "vedligeholdelse",
      label: "Skift token, sæt på pause eller fjern",
      summary:
        "Vedligehold forbindelserne, og kontrollér følgerne for salgshistorik og produktkoblinger, før du skifter konto eller fjerner en forbindelse.",
      appHref: "/administration/integrations",
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
        { href: "/help/integrationer/onlinepos/forbindelser", label: "Forbind masterkonto og lokationer" },
        { href: "/help/integrationer/onlinepos/salg", label: "Kontrollér salg og historik" },
        { href: "/help/integrationer/onlinepos/lager", label: "Indstillinger for lageropdatering" },
      ],
    },
  ],
};

const workfeedGuide: HelpGuide = {
  slug: "workfeed",
  label: "Workfeed",
  summary:
    "Forbind Workfeed, kobl afdelinger til lokationer, og hent medarbejdere og offentliggjorte vagter.",
  appHref: "/administration/integrations",
  appLinkLabel: "Åbn Workfeed-indstillinger",
  sections: [
    {
      id: "forbind",
      title: "Forbind jeres Workfeed-konto",
      steps: [
        "Hav Workfeed CompanyID og API-nøgle klar. Kontakt Workfeed, hvis I mangler oplysningerne eller API-adgang.",
        "Åbn Administration → Integrationer → Workfeed, og brug kontakten til at åbne opsætningen. Udfyld CompanyID og API-nøgle, og vælg Forbind Workfeed.",
        "Kontrollér beskeden om, hvor mange afdelinger der er fundet. API-nøglen gemmes på serveren og vises ikke igen.",
      ],
      bullets: [
        "Du skal kunne administrere integrationer. Forbindelse, aktivering og fjernelse af hele integrationen kræver adgang til alle lokationer.",
        "Lokationerne skal være oprettet i Administration, før du kan koble Workfeed-afdelinger til dem.",
      ],
    },
    {
      id: "afdelinger",
      title: "Kobl hver Lokation til en afdeling",
      steps: [
        "Vælg Vis ved Lokationer og afdelinger.",
        "Find lokationen, og vælg den Workfeed-afdeling, der indeholder dens vagtplan. Valget gemmes med det samme og starter en synkronisering.",
        "Gentag for hver Lokation. Brug Opdatér afdelinger, hvis en ny afdeling fra Workfeed mangler.",
      ],
      bullets: [
        "Hver Workfeed-afdeling kan kun kobles til én Lokation. En afdeling, der allerede bruges, er låst i listen og viser den tilknyttede Lokation.",
        "Du kan kun ændre koblinger for lokationer, du har adgang til.",
      ],
    },
    {
      id: "kontroller-data",
      title: "Kontrollér medarbejdere og vagter",
      steps: [
        "Åbn Medarbejdere, vælg Lokation, og brug fanen Vagtplan. Skift uge med pilene eller Denne uge.",
        "Kontrollér en kendt offentliggjort vagt og dens medarbejder. Workfeed-kladder bliver ikke hentet.",
        "Åbn fanen Medarbejdere for at søge efter en medarbejder og kontrollere lokationstilknytning og status.",
        "Brug Synkronisér nu på medarbejdersiden efter ændringer i Workfeed. Vent på, at synkroniseringen er færdig, før du sammenligner igen.",
      ],
      bullets: [
        "Den automatiske synkronisering kører dagligt. Den henter medarbejdere og offentliggjorte vagter fra 30 dage tilbage til 60 dage frem.",
        "Vagtplan og medarbejderoversigt har separate adgangsrettigheder. En Bruger kan derfor have adgang til én af fanerne.",
        "Workfeed-medarbejdere er ikke appens Brugere. Invitations-, rolle- og loginadgang styres under Administration → Brugere.",
        "Medarbejdersiden viser de senest hentede data, hvis forbindelsen fejler. Læs advarslen, før du bruger dem som en aktuel vagtplan.",
      ],
    },
    {
      id: "vedligeholdelse",
      title: "Opdatér eller fjern forbindelsen",
      bullets: [
        "Indtast den nye API-nøgle, og vælg Opdatér forbindelse for at udskifte nøglen. Kontrollér, at CompanyID stadig er det rigtige.",
        "Skifter du CompanyID, slettes de eksisterende afdelingskoblinger. Kobl lokationerne til afdelingerne på den nye konto.",
        "Deaktivér integrationen for at stoppe automatiske opdateringer. De senest synkroniserede medarbejderdata vises fortsat med en advarsel.",
        "Fjern kobling stopper tilknytningen mellem den enkelte Lokation og Workfeed-afdelingen. Fjern forbindelse sletter API-nøglen og alle afdelingskoblinger. Tidligere hentede medarbejderdata kan stadig vises, men opdateres ikke.",
      ],
    },
  ],
  troubleshooting: [
    {
      question: "En afdeling mangler eller kan ikke vælges",
      answer:
        "Brug Opdatér afdelinger, og kontrollér CompanyID. En afdeling, der allerede er koblet til en anden Lokation, kan ikke vælges igen. Ret den eksisterende kobling, hvis den er forkert.",
    },
    {
      question: "Vagtplanen er tom",
      answer:
        "Kontrollér valgt Lokation og uge, afdelingskoblingen og at vagterne er offentliggjort i Workfeed. Start derefter Synkronisér nu. Vagter uden for importens periode bliver ikke hentet ved den normale synkronisering.",
    },
    {
      question: "Manuel synkronisering er låst eller mangler",
      answer:
        "Integrationen skal være aktiv. Knappen er låst, mens en synkronisering kører, eller når der skal gå lidt tid mellem forsøg. Manuel synkronisering vises ikke i kiosktilstand. Brug en almindelig session med adgang til Medarbejdere.",
    },
  ],
  relatedLinks: [
    {
      href: "/help/medarbejdere/overblik",
      label: "Brug vagtplan og medarbejderoversigt",
    },
    { href: "/employees", label: "Åbn Vagtplan" },
    { href: "/administration/locations", label: "Administrér lokationer" },
    {
      href: "/help/adgang-og-profil/overblik",
      label: "Brugere, roller og adgang",
    },
  ],
};

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

const woltGuide: HelpGuide = {
  slug: "wolt",
  label: "Wolt",
  summary:
    "Forbind Wolt pr. Lokation, kobl Wolt-produkter til produktkataloget, og kontrollér, at nye ordrer kommer ind.",
  appHref: "/administration/integrations",
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
        "Åbn Administration → Integrationer → Wolt. Brug kontakten eller Vis til at åbne opsætningen.",
        "Find lokationen, og vælg Start SSIO. Fuldfør godkendelsen hos Wolt for det rigtige salgssted.",
        "Når du vender tilbage, behandles godkendelsen, og status opdateres automatisk. Kontrollér lokationens forbindelsesstatus og Venue-id.",
        "Kontrollér forbindelsen med en ny ordre efter godkendelsen. SSIO henter nye events fra tilslutningen og importerer ikke automatisk tidligere ordrer.",
      ],
      screenshot: {
        src: "/help/screenshots/wolt-ordrer.webp",
        alt: "Wolt-afsnittet under Integrationer med aktiveringskontakt og knappen Vis",
        caption:
          "Vælg Vis for at åbne Wolt-indstillingerne. Eksemplet viser integrationen før aktivering.",
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
        "Deaktivér Wolt for at stoppe hentning af nye ordrer for organisationen. Ordrehistorikken kan stadig læses i op til 400 dage.",
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
        "OnlinePOS henter produktlisten til koblinger og salg pr. Lokation. Undersiderne gennemgår forbindelser, produktkoblinger, salg, lager og vedligeholdelse.",
        "Workfeed henter medarbejdere og offentliggjorte vagter. Hver Workfeed-afdeling kobles til en Lokation.",
        "Wolt henter nye ordrer via SSIO eller WIO. Forbind hver Lokation, kobl de observerede Produkter, og brug Wolt-ordrer til at følge ordredetaljer og statushistorik.",
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
        "Deaktivering sætter opdateringer på pause. Fjernelse og kontoskift kan også slette koblinger eller historik. Følg vejledningen for den enkelte integration, før du ændrer forbindelsen.",
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
    "Opsæt og brug OnlinePOS, Workfeed og Wolt med de rigtige lokations- og produktkoblinger.",
  icon: PlugIcon,
  guides: [
    integrationOverview,
    onlinePosGuide,
    workfeedGuide,
    woltGuide,
  ],
};
