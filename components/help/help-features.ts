import type { LucideIcon } from "lucide-react";
import {
  ArrowRightLeftIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  LayoutDashboardIcon,
  PackageCheckIcon,
  SettingsIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  Trash2Icon,
  UserRoundIcon,
  UsersRoundIcon,
  UtensilsIcon,
} from "lucide-react";

export type HelpSetting = {
  title: string;
  description: string;
  href: string;
  linkLabel: string;
};

export type HelpFeature = {
  slug: string;
  number: string;
  label: string;
  title: string;
  summary: string;
  prerequisites: string[];
  steps: string[];
  verification: string[];
  note: string;
  icon: LucideIcon;
  screenshot?: {
    src: string;
    alt: string;
    caption: string;
    width: number;
    height: number;
  };
  appHref: string;
  appLinkLabel: string;
  settingsTitle: string;
  settingsIntro: string;
  settingsHref: string;
  settingsLinkLabel: string;
  settings: HelpSetting[];
};

export const helpFeatures: HelpFeature[] = [
  {
    slug: "dashboard",
    number: "01",
    label: "Dashboard",
    title: "Sæt et dashboard op til driften",
    summary:
      "Saml omsætning, Waste, arbejdstimer og andre målinger i widgets. Vælg, hvilke tal der skal vises, og hvem der skal kunne se dem.",
    prerequisites: [
      "Din rolle skal have adgang til at administrere dashboards.",
      "De valgte målinger skal have data. Salg kræver en tilsluttet salgskilde, og arbejdstimer kræver Workfeed.",
    ],
    steps: [
      "Åbn Dashboard, og vælg eller opret det dashboard, du vil sætte op.",
      "Vælg Tilføj widget. Vælg først Måling, derefter Visualisering og Størrelse. Vælg Salgskilde, når feltet vises, og tilføj widgetten.",
      "Åbn Dashboardindstillinger med tandhjulet. Angiv navn og de roller, der må se dashboardet. Ingen valgte roller betyder alle roller.",
      "Vælg eventuelt dashboardet som standard for organisationen, bestemte roller eller lokationer. Gem indstillingerne, og placér de vigtigste widgets først.",
    ],
    verification: [
      "Vælg en periode med kendte data og én Lokation. Kontrollér, at tallene svarer til den valgte periode og Lokation.",
      "Kontrollér adgang og standarddashboard med en Bruger i den rolle, opsætningen er lavet til.",
    ],
    note:
      "Et delt dashboard er en læsevisning. Gennemgå de viste data, og vælg adgangskode og udløbsdato, før du deler linket.",
    icon: LayoutDashboardIcon,
    screenshot: {
      src: "/help/screenshots/dashboard.webp",
      alt: "Dialogen Tilføj widget med trinnene Måling, Visualisering og Størrelse",
      caption: "Vælg en måling i Tilføj widget. Fortsæt derefter til visualisering og størrelse.",
      width: 828,
      height: 730,
    },
    appHref: "/dashboard",
    appLinkLabel: "Åbn Dashboard",
    settingsTitle: "De vigtigste dashboardvalg",
    settingsIntro: "Dashboardets tandhjul styrer adgang og standarder. Widgetten styrer selve målingen.",
    settingsHref: "/dashboard",
    settingsLinkLabel: "Åbn Dashboardindstillinger",
    settings: [
      {
        title: "Måling og salgskilde",
        description: "Vælg den måling, du vil følge. Kontrollér salgskilden på widgets med salgsdata, så sammenligninger bruger det ønskede grundlag.",
        href: "/dashboard",
        linkLabel: "Tilføj en widget",
      },
      {
        title: "Adgang og standarddashboard",
        description: "Vælg roller under adgang. Standard for roller og lokationer bestemmer, hvilket dashboard de åbner på. En Lokation kan kun have ét standarddashboard.",
        href: "/dashboard",
        linkLabel: "Åbn dashboardets indstillinger",
      },
      {
        title: "Datakilder",
        description: "Forbind salgskilder og Workfeed under Integrationer. En tom widget kan skyldes manglende data eller en forkert periode.",
        href: "/administration/integrations",
        linkLabel: "Kontrollér integrationer",
      },
    ],
  },
  {
    slug: "wolt-ordrer",
    number: "02",
    label: "Wolt-ordrer",
    title: "Forbind Wolt og kobl produkterne",
    summary:
      "Se Wolt-ordrer, produktlinjer, beløb og statushistorik. Forbind først hver Lokation, og kobl derefter Wolt-produkterne til jeres produktkatalog.",
    prerequisites: [
      "Opret de lokationer og Produkter, der skal bruges, i Administration.",
      "Din rolle skal have integrationsadgang. WIO-opsætning kræver desuden adgang til alle lokationer.",
    ],
    steps: [
      "Åbn Administration → Integrationer → Wolt, og aktivér integrationen.",
      "Find den rigtige Lokation. Vælg Start SSIO, og fuldfør godkendelsen hos Wolt. Hvis forbindelsen bruger WIO, skal du i stedet gemme lokationens WIO partner-venue-id.",
      "Kontrollér forbindelsesstatus. SSIO modtager nye events efter godkendelsen, så brug en ny ordre til at kontrollere forbindelsen.",
      "Find de observerede Wolt-produkter. Vælg det lokale Produkt og Gælder for, og gem hver kobling. Vælg kun alle lokationer, når koblingen er den samme på tværs af organisationen.",
    ],
    verification: [
      "Åbn Wolt-ordrer, vælg Lokation og dato, og find en ordre modtaget efter tilslutningen.",
      "Åbn ordren, og kontrollér produktkoblinger, beløb og statushistorik.",
    ],
    note: "Et navneforslag er ikke en gemt produktkobling. Vælg Produktet, og tryk Gem.",
    icon: ShoppingBagIcon,
    screenshot: {
      src: "/help/screenshots/wolt-ordrer.webp",
      alt: "Wolt-sektionen under Integrationer med aktivering og knappen Vis",
      caption: "Aktivér Wolt under Integrationer, og vælg Vis for at åbne forbindelserne.",
      width: 1066,
      height: 74,
    },
    appHref: "/wolt-orders",
    appLinkLabel: "Åbn Wolt-ordrer",
    settingsTitle: "Forbindelse og produktkoblinger",
    settingsIntro: "Alle Wolt-indstillinger findes under Administration → Integrationer → Wolt.",
    settingsHref: "/administration/integrations",
    settingsLinkLabel: "Åbn Wolt-indstillinger",
    settings: [
      {
        title: "Forbindelse pr. Lokation",
        description: "Brug SSIO-godkendelse eller det aftalte WIO partner-venue-id. Kontrollér, at forbindelsen tilhører den rigtige Lokation.",
        href: "/administration/integrations",
        linkLabel: "Åbn Wolt-forbindelser",
      },
      {
        title: "Produkt og gyldighed",
        description: "Vælg et lokalt Produkt for hver observeret Wolt-produktlinje. En lokal kobling kan bruges, når samme Wolt-produkt skal kobles anderledes på en bestemt Lokation.",
        href: "/administration/integrations",
        linkLabel: "Åbn produktkoblinger",
      },
      {
        title: "Fejl og ny godkendelse",
        description: "Læs forbindelsens fejlstatus. Brug Godkend SSIO igen ved behov for ny godkendelse, og prøv fejlede events igen, når årsagen er løst.",
        href: "/administration/integrations",
        linkLabel: "Kontrollér Wolt-status",
      },
    ],
  },
  {
    slug: "transfer",
    number: "03",
    label: "Transfer",
    title: "Klargør Transfer mellem lokationer",
    summary:
      "Opret en transfer med afsender, modtager, Produkter og mængder. Modtageren registrerer bagefter, hvad der faktisk er leveret, under Varemodtagelse.",
    prerequisites: [
      "Opret både afsender- og modtagerlokationen i Administration → Lokationer.",
      "Opret Produkter med de enheder og omregninger, der bruges ved levering.",
    ],
    steps: [
      "Åbn Administration → Produkter. Kontrollér standardenhed og omregninger på hvert Produkt, der skal flyttes.",
      "Angiv Maksimal temperatur på Produkter, hvor temperaturen skal registreres ved Transfer.",
      "Åbn Administration → Brugere → Roller og adgang. Giv afsenderen adgang til at oprette transfers og modtageren adgang til at registrere varemodtagelser. Kontrollér begge Brugeres lokationsadgang.",
      "Åbn Transfer. Vælg fra- og til-lokation, ansvarlig og transferdato. Tilføj Produkter, enheder, mængder og eventuelle temperaturer, og gem transferen.",
    ],
    verification: [
      "Find transferen i Transferhistorik, og kontrollér retning, enheder, mængder og temperaturer.",
      "Kontrollér, at transferen vises under Varemodtagelse på modtagerlokationen.",
    ],
    note: "Modtageren skal kontrollere de leverede mængder og registrere varemodtagelsen for at afslutte leveringen.",
    icon: ArrowRightLeftIcon,
    screenshot: {
      src: "/help/screenshots/product-temperature.webp",
      alt: "Produkteditor med kategori og feltet Maksimal temperatur",
      caption: "Angiv produktets temperaturgrænse under Administration → Produkter. Eksemplet viser feltet før udfyldning.",
      width: 511,
      height: 340,
    },
    appHref: "/transfers",
    appLinkLabel: "Opret Transfer",
    settingsTitle: "Grunddata til Transfer",
    settingsIntro: "Transfer bruger produktkatalog, lokationer og roller. Der er ingen særskilt Transfer-indstillingsside.",
    settingsHref: "/administration/products",
    settingsLinkLabel: "Åbn Produktopsætning",
    settings: [
      {
        title: "Enheder og omregninger",
        description: "Angiv, hvor mange standardenheder hver anden enhed svarer til. Kontrollér især forskellen mellem eksempelvis stk. og kasse.",
        href: "/administration/products",
        linkLabel: "Åbn Produkter",
      },
      {
        title: "Maksimal temperatur",
        description: "Produktets temperaturgrænse styrer temperaturregistreringen. Temperaturafvigelser markeres på transferen.",
        href: "/administration/products",
        linkLabel: "Kontrollér temperaturgrænser",
      },
      {
        title: "Afsender og modtager",
        description: "Brugernes roller skal tillade de relevante handlinger, og deres lokationsadgang skal omfatte de lokationer, de arbejder med.",
        href: "/administration/users",
        linkLabel: "Kontrollér Brugernes adgang",
      },
    ],
  },
  {
    slug: "waste",
    number: "04",
    label: "Waste",
    title: "Sæt Waste og dårlige leveringer op",
    summary:
      "Registrér kasserede Produkter og dokumentér dårlige leveringer. Vælg de rigtige Produkter, genveje og regler for lagerfradrag, før funktionen tages i brug.",
    prerequisites: [
      "Opret Produkter og enheder i produktkataloget.",
      "Kontrollér lokationens produktvalg under Administration → Lokationer → Produkter og Områder. Det bruges af både Count og Waste.",
    ],
    steps: [
      "Åbn Administration → Waste. Indstil Nulstil efter inaktivitet, så en fælles tablet vender tilbage til Registrér efter den ønskede tid.",
      "Vælg Popularitetsperiode og Brug historik fra hele organisationen. Slå organisationshistorik fra, hvis genvejene skal følge den enkelte Lokations Waste.",
      "Under Dårlige leveringer skal du vælge Træk som standard fra lager og Vis valget ved registrering. Afklar, om de afviste Produkter allerede indgår i lageret, så de ikke trækkes fra to gange.",
      "Udfyld Til, E-mailens emne og E-mailens indhold, hvis dårlige leveringer skal sende automatiske meddelelser. Gem indstillingerne i begge afsnit.",
    ],
    verification: [
      "Åbn Waste på den relevante Lokation. Kontrollér produktvalg og enheder, før den første registrering gemmes.",
      "Åbn Dårlig levering, og kontrollér lagerfradrag og dokumentationsfelter. Find efterfølgende registreringen i Waste-rapporten.",
    ],
    note: "En tom Til-liste deaktiverer automatiske meddelelser om dårlige leveringer.",
    icon: Trash2Icon,
    screenshot: {
      src: "/help/screenshots/waste.webp",
      alt: "Waste-indstillinger med nulstilling, popularitetsperiode og adgang til historik",
      caption: "Indstil nulstilling, produktpopularitet og adgang til Waste-historik. De viste valg er et eksempel.",
      width: 711,
      height: 251,
    },
    appHref: "/waste",
    appLinkLabel: "Registrér Waste",
    settingsTitle: "Waste-indstillinger",
    settingsIntro: "Indstillingerne er opdelt i Waste og Dårlige leveringer. Hvert afsnit skal gemmes.",
    settingsHref: "/administration/waste",
    settingsLinkLabel: "Åbn Waste-indstillinger",
    settings: [
      {
        title: "Produktvalg pr. Lokation",
        description: "Vælg alle aktive Produkter eller en afgrænset liste under Produkter og Områder. Mangler et Produkt i Waste, skal du kontrollere denne liste.",
        href: "/administration/locations",
        linkLabel: "Åbn lokationens produktvalg",
      },
      {
        title: "Genveje og inaktivitet",
        description: "Popularitetsperiode og historik bestemmer de anbefalede genveje. Nulstilling rydder søgning og dialoger og viser Alle produkter.",
        href: "/administration/waste",
        linkLabel: "Indstil Waste-genveje",
      },
      {
        title: "Dårlige leveringer",
        description: "Vælg standard for lagerfradrag og om medarbejderen må se valget. E-mailskabelonen kan bruge felter som {location}, {products} og {comment}.",
        href: "/administration/waste",
        linkLabel: "Indstil dårlige leveringer",
      },
    ],
  },
  {
    slug: "egenkontrol",
    number: "05",
    label: "Egenkontrol",
    title: "Opret kontroller med felter og frister",
    summary:
      "Byg de kontroller, lokationerne skal udføre, og angiv tidspunkter, målefelter og grænser. Følg registreringer og afvigelser i Egenkontrol.",
    prerequisites: [
      "Opret de lokationer, der skal udføre kontrollerne, og kontrollér deres tidszoner.",
      "Din rolle skal have adgang til at administrere egenkontroller. Aftal, hvem der skal udføre og godkende dem.",
    ],
    steps: [
      "Åbn Administration → Egenkontrol, og opret en egenkontrol. Angiv navn, kontroltype og en instruktion, der beskriver, hvad medarbejderen skal gøre.",
      "Tilføj felterne, der skal udfyldes, og de relevante grænser. Vælg frekvens, Starter kl. og Forfalder kl. samt de lokationer, kontrollen gælder for.",
      "Indstil Frist for efterregistrering. Vælg 0, hvis en kontrol kun må registreres samme dag.",
      "Vælg regler for godkendelse og Count-blokering. Angiv Begrundelse for ændringer, og gem indstillingerne.",
    ],
    verification: [
      "Vælg en tilknyttet Lokation under Egenkontrol → I dag. Kontrollér, at kontrollen vises på den planlagte dato med de rigtige felter og frister.",
      "Kontrollér efter den første udførelse, at registreringen og eventuelle afvigelser kan findes i Oversigt og Dokumentation.",
    ],
    note: "Ansvarlig rolle bruges til visning og filtrering. Den begrænser ikke i sig selv, hvem der kan udføre kontrollen.",
    icon: ClipboardCheckIcon,
    screenshot: {
      src: "/help/screenshots/egenkontrol.webp",
      alt: "Egenkontrol-indstillinger for efterregistrering, godkendelse og Count-blokering",
      caption: "Vælg frist for efterregistrering og krav til godkendelse. De viste valg er et eksempel.",
      width: 711,
      height: 432,
    },
    appHref: "/own-checks",
    appLinkLabel: "Åbn Egenkontrol",
    settingsTitle: "Skabeloner og fælles regler",
    settingsIntro: "Skabelonen beskriver kontrollen. De fælles indstillinger gælder på tværs af egenkontroller.",
    settingsHref: "/administration/own-checks",
    settingsLinkLabel: "Åbn indstillinger for egenkontrol",
    settings: [
      {
        title: "Felter, grænser og tidsplan",
        description: "Vælg det, der skal registreres, og hvornår kontrollen skal udføres. Tidligere versioner bevares, så historiske kontroller beholder deres oprindelige felter og grænser.",
        href: "/administration/own-checks",
        linkLabel: "Åbn egenkontroller",
      },
      {
        title: "Godkendelse af en anden person",
        description: "Slå kravet til, hvis den udførende person ikke selv skal godkende. Brugere med adgang til at administrere egenkontroller er undtaget.",
        href: "/administration/own-checks",
        linkLabel: "Indstil godkendelse",
      },
      {
        title: "Efterregistrering og Count",
        description: "Angiv antal dage til efterregistrering, og vælg om Egenkontrol skal blokeres under Count. Gem med en begrundelse.",
        href: "/administration/own-checks",
        linkLabel: "Åbn fælles regler",
      },
    ],
  },
  {
    slug: "staff-food",
    number: "06",
    label: "Staff food",
    title: "Kobl Staff food til vagtlængde",
    summary:
      "Bestem, hvilke Produkter en medarbejder må vælge, og hvor meget der må tages fra hver kategori. Den regel, der passer til vagtens længde, vises under registrering.",
    prerequisites: [
      "Forbind Workfeed, og kobl lokationerne til de rigtige afdelinger under Administration → Integrationer.",
      "Opret kategorier og Produkter. Din rolle skal have adgang til at administrere Staff food.",
    ],
    steps: [
      "Åbn Administration → Staff food, og vælg Ny regel.",
      "Angiv Minimum vagtlængde i timer. Brug hele eller halve timer mellem 0,5 og 24.",
      "Tilføj en kategori-regel for hver kategori, medarbejderen må vælge fra. Angiv det samlede antal og vælg de konkrete tilladte Produkter.",
      "Gem reglen. Opret flere regler, hvis længere vagter skal give en anden mængde eller et andet produktvalg.",
    ],
    verification: [
      "Åbn Staff food, og vælg en medarbejder på vagt. Kontrollér Lokation, vagtlængde, kategoriantal og tilladte Produkter.",
      "Kontrollér også en vagt under den første regels minimum. Den skal ikke give samme adgang som en vagt, der opfylder reglen.",
    ],
    note: "Hvis flere regler passer, gælder reglen med den højeste minimumsvagtlængde. Reglerne lægges ikke sammen.",
    icon: UtensilsIcon,
    screenshot: {
      src: "/help/screenshots/staff-food.webp",
      alt: "Ny Staff food-regel med minimumstimer, kategori og antal",
      caption: "Angiv minimumstimer, tilføj en kategori, og vælg antal og tilladte Produkter. Den viste regel er et eksempel.",
      width: 944,
      height: 456,
    },
    appHref: "/staff-food",
    appLinkLabel: "Åbn Staff food",
    settingsTitle: "Regler og medarbejderdata",
    settingsIntro: "Kontrollér både Workfeed-forbindelsen og produktvalget, hvis medarbejderen ikke får den forventede regel.",
    settingsHref: "/administration/staff-food",
    settingsLinkLabel: "Åbn Staff food-indstillinger",
    settings: [
      {
        title: "Vagtlængde og kategoriantal",
        description: "Minimumsvagtlængden udløser reglen. Antallet gælder samlet for den valgte kategori, så alle Produkter i kategorien deler samme grænse.",
        href: "/administration/staff-food",
        linkLabel: "Åbn Staff food-regler",
      },
      {
        title: "Tilladte Produkter",
        description: "Vælg de konkrete Produkter i hver kategori-regel. Kontrollér listen, når produktkataloget ændres.",
        href: "/administration/staff-food",
        linkLabel: "Kontrollér produktvalg",
      },
      {
        title: "Vagter fra Workfeed",
        description: "Kobl den rigtige Workfeed-afdeling til hver Lokation. Registreringssiden kan også oprette en erstatningsvagt med en angivet vagtlængde.",
        href: "/administration/integrations",
        linkLabel: "Kontrollér Workfeed",
      },
    ],
  },
  {
    slug: "count",
    number: "07",
    label: "Count",
    title: "Planlæg Count og vælg Produkter",
    summary:
      "Afstem lageret med en Count. Sæt først åbningstider, produktvalg, områder og Count-frekvens op, så lokationen får den rigtige optælling på det rigtige tidspunkt.",
    prerequisites: [
      "Opret Produkter med korrekte standardenheder og omregninger.",
      "Angiv lokationens åbningstider og særlige datoer under Administration → Lokationer.",
    ],
    steps: [
      "Åbn Administration → Lokationer → Produkter og Områder. Vælg alle aktive Produkter eller de Produkter, lokationen bruger. Opret eventuelle Count-områder, og vælg deres Produkter og rækkefølge.",
      "Åbn Administration → Count. Vælg Count-frekvens. Ved månedlig Count vælger du Count-dag; ved interval vælger du Interval i dage og Første Count-dato.",
      "Vælg, om Count må registreres uden for Count-vinduet, om den skal afsluttes før åbning, og om andre funktioner skal låses. Gem Count-indstillinger.",
      "Kontrollér Salgskilde til Count for hver Lokation, hvis Waste-rapporten i Count skal bruge salgsdata. Vælg den kilde, der dækker lokationens salg.",
    ],
    verification: [
      "Åbn Count på den relevante Lokation. Kontrollér dato, vindue, områder og produktliste, før optællingen starter.",
      "Efter en registreret Count skal du kontrollere Lager. Kun Produkter med en angivet mængde overskriver lageret; et tomt felt er ikke det samme som 0.",
    ],
    note: "En registreret Count kan ikke rettes. Kontrollér mængder og enheder, før du bekræfter med en begrundelse.",
    icon: ClipboardListIcon,
    screenshot: {
      src: "/help/screenshots/count.webp",
      alt: "Count-indstillinger med frekvens, dag og regler for Count-vinduet",
      caption: "Vælg Count-frekvens, Count-dag og regler for registrering. De viste valg er et eksempel.",
      width: 711,
      height: 570,
    },
    appHref: "/count",
    appLinkLabel: "Åbn Count",
    settingsTitle: "Det, der styrer Count",
    settingsIntro: "Lokationens åbningstider og produktvalg arbejder sammen med organisationens Count-indstillinger.",
    settingsHref: "/administration/count",
    settingsLinkLabel: "Åbn Count-indstillinger",
    settings: [
      {
        title: "Åbningstider og Count-vindue",
        description: "Count åbner ved lukketid på Count-dagen. Kræv Count før åbning holder vinduet åbent, indtil Count er registreret. Ellers lukker det, når lokationen åbner igen.",
        href: "/administration/locations",
        linkLabel: "Kontrollér åbningstider",
      },
      {
        title: "Produkter og områder",
        description: "Produktvalget bruges af både Count og Waste. Områder opdeler optællingen, og rækkefølgen kan tilpasses den fysiske placering af Produkterne.",
        href: "/administration/locations",
        linkLabel: "Opsæt Produkter og Områder",
      },
      {
        title: "Lås andre funktioner under Count",
        description: "Når Count-vinduet åbner, låses andre sider end Count, Lager og Indstillinger for den valgte Lokation. Låsen ophæves, når Count er registreret.",
        href: "/administration/count",
        linkLabel: "Indstil Count-låsning",
      },
      {
        title: "Salgskilde til Count",
        description: "Vælg OnlinePOS eller Wolt pr. Lokation. Kontrollér, at salgskilden har data og produktkoblinger for den periode, rapporten dækker.",
        href: "/administration/count",
        linkLabel: "Vælg salgskilde",
      },
    ],
  },
  {
    slug: "medarbejdere",
    number: "08",
    label: "Medarbejdere",
    title: "Forbind Workfeed til vagtplanen",
    summary:
      "Vis medarbejdere og vagter fra Workfeed på de rigtige lokationer. Opsætningen består af forbindelsen, afdelingskoblinger og tidszonen for vagtplanen.",
    prerequisites: [
      "Hav CompanyID og API-nøgle fra Workfeed klar.",
      "Opret lokationerne, og sørg for, at din rolle har adgang til at administrere integrationer.",
    ],
    steps: [
      "Åbn Administration → Integrationer → Workfeed, og aktivér integrationen. Indtast CompanyID og API-nøgle, og vælg Forbind Workfeed.",
      "Under Lokationer og afdelinger skal du vælge den Workfeed-afdeling, der har hver Lokations vagtplan. Kontrollér koblingen for alle lokationer, der bruger medarbejderdata.",
      "Åbn Administration → Vagtplan. Vælg Tidszone, som skal bruges til vagtplanens uger, datoer og klokkeslæt, og gem.",
      "Giv de relevante roller adgang til Vagtplan, Register eller begge under Roller og adgang. Kontrollér også Brugernes lokationsadgang.",
    ],
    verification: [
      "Åbn Medarbejdere, og vælg en uge og Lokation med kendte vagter. Sammenlign medarbejdernavne og tidspunkter med Workfeed.",
      "Åbn Register, og find en medarbejder fra den afdeling, du har koblet til lokationen.",
    ],
    note: "Ret medarbejderdata og vagter i Workfeed. Appens vagtplan og register bruger Workfeed som kilde.",
    icon: UsersRoundIcon,
    screenshot: {
      src: "/help/screenshots/medarbejdere.webp",
      alt: "Vagtplanens tidszoneindstilling",
      caption: "Vælg tidszonen, der skal bruges til datoer og klokkeslæt i vagtplanen.",
      width: 711,
      height: 215,
    },
    appHref: "/employees",
    appLinkLabel: "Åbn Medarbejdere",
    settingsTitle: "Workfeed og vagtplan",
    settingsIntro: "Medarbejdere har ingen særskilt indstillingsside. Brug Integrationer og Vagtplan i Administration.",
    settingsHref: "/administration/integrations",
    settingsLinkLabel: "Åbn Workfeed-indstillinger",
    settings: [
      {
        title: "CompanyID og API-nøgle",
        description: "Brug oplysningerne for den rigtige Workfeed-virksomhed. API-nøglen vises ikke igen, når den er gemt.",
        href: "/administration/integrations",
        linkLabel: "Åbn Workfeed-forbindelsen",
      },
      {
        title: "Afdeling pr. Lokation",
        description: "En forkert afdelingskobling kan vise de forkerte vagter og medarbejdere. Kontrollér koblingen, hvis en Lokation mangler i vagtplanen eller Staff food.",
        href: "/administration/integrations",
        linkLabel: "Kontrollér afdelingskoblinger",
      },
      {
        title: "Tidszone for vagtplan",
        description: "Denne tidszone styrer uger, datoer og klokkeslæt i medarbejdernes vagtplan. Kontrollér den, hvis vagter vises på en forkert dag eller et forkert tidspunkt.",
        href: "/administration/schedule",
        linkLabel: "Vælg vagtplanens tidszone",
      },
    ],
  },
  {
    slug: "administration",
    number: "09",
    label: "Administration",
    title: "Klargør organisationens grunddata",
    summary:
      "Opret lokationer, Produkter og Brugere, før driftsfunktionerne tages i brug. Administration samler derefter regler, integrationer og udseende.",
    prerequisites: [
      "Du skal have adgang til de administrationsområder, du vil ændre.",
      "Hav en liste over lokationer, åbningstider, Produkter og de roller, Brugerne skal have.",
    ],
    steps: [
      "Åbn Administration → Lokationer. Opret lokationerne, og angiv tidszone, valuta og åbningstider. Tilføj særlige lukkedage, når de kendes.",
      "Opret kategorier og enheder, og tilføj Produkter. Vælg standardenhed og omregninger. Angiv ingredienser og mængder på Produkter, der består af andre Produkter.",
      "Åbn Brugere → Roller og adgang, og vælg handlinger og datavisning for hver rolle. Invitér derefter Brugere med den rigtige rolle, og kontrollér deres lokationsadgang.",
      "Forbind de integrationer, organisationen bruger, og følg funktionsguiden for eksempelvis Count, Waste eller Staff food. Afslut med organisationens udseende og sidemenu.",
    ],
    verification: [
      "Åbn hver Lokation, og kontrollér åbningstider, produktvalg og integrationskoblinger.",
      "Gennemgå de vigtigste funktioner med en Bruger fra den daglige drift. Kontrollér, at de nødvendige Produkter og handlinger er tilgængelige.",
    ],
    note: "Start med korrekte enheder og produktkoblinger. De samme grunddata bruges i flere funktioner og rapporter.",
    icon: SettingsIcon,
    screenshot: {
      src: "/help/screenshots/product-setup.webp",
      alt: "Produkteditor med produktdetaljer, enheder, omregninger og ingredienser",
      caption: "Produktopsætning med eksempeldata. Standardenheder og ingredienser bruges på tværs af driftsfunktionerne.",
      width: 1165,
      height: 1006,
    },
    appHref: "/administration",
    appLinkLabel: "Åbn Administration",
    settingsTitle: "Start med grunddata",
    settingsIntro: "Brug disse områder som grundlag for de øvrige funktionsguides.",
    settingsHref: "/administration",
    settingsLinkLabel: "Åbn Administration",
    settings: [
      {
        title: "Lokationer og åbningstider",
        description: "Kontrollér tidszone, valuta, status og åbningstider. Åbningstiderne bruges blandt andet af Count-vinduet og Bestilling.",
        href: "/administration/locations",
        linkLabel: "Opsæt lokationer",
      },
      {
        title: "Produkter, enheder og ingredienser",
        description: "Vælg en standardenhed, og angiv omregninger for de andre enheder. Angiv ingredienser med mængde og enhed, når et Produkt har en opskrift.",
        href: "/administration/products",
        linkLabel: "Åbn produktkataloget",
      },
      {
        title: "Brugere og roller",
        description: "Vælg handlinger i Roller og adgang. Tildel derefter rolle og lokationsadgang til den enkelte Bruger.",
        href: "/administration/users",
        linkLabel: "Opsæt Brugere",
      },
      {
        title: "Integrationer",
        description: "Workfeed leverer medarbejdere og vagter, OnlinePOS leverer salg, og Wolt leverer ordrer. Kontrollér forbindelser og produktkoblinger efter opsætning.",
        href: "/administration/integrations",
        linkLabel: "Åbn integrationer",
      },
    ],
  },
  {
    slug: "adgang-og-profil",
    number: "10",
    label: "Adgang og profil",
    title: "Giv hver Bruger den rigtige adgang",
    summary:
      "Rollen bestemmer, hvad en Bruger må gøre og se. Lokationsadgangen bestemmer, hvor Brugeren må arbejde. Kontrollér begge dele ved oprettelse og ændringer.",
    prerequisites: [
      "Din rolle skal have adgang til at administrere de Brugere og roller, du vil ændre.",
      "Aftal, hvilke handlinger og lokationer hver Bruger skal have adgang til.",
    ],
    steps: [
      "Åbn Administration → Brugere → Roller og adgang. Brug Administrator, Manager eller Medlem som udgangspunkt, eller opret en tilpasset rolle.",
      "Vælg de nødvendige handlinger og Datavisning for rollen. Angiv Begrundelse, og gem ændringerne.",
      "Åbn Brugere. Invitér Brugeren med e-mail og rolle. Når Brugeren er tilføjet, skal du kontrollere lokationsadgangen og vælge alle lokationer, udvalgte lokationer eller en operatør. Angiv en begrundelse, før adgangen ændres.",
      "Brug Administration → Kiosk til en fælles enhed. Opret en kioskkonto med fast Lokation, og vælg tilladte sider, startside og inaktivitet.",
    ],
    verification: [
      "Kontrollér med den berørte Bruger, at de nødvendige sider og handlinger er tilgængelige.",
      "Kontrollér, at lokationsvælgeren og datavisningen svarer til den tildelte adgang.",
    ],
    note: "Profil viser dine kontooplysninger. Adgang til organisationens funktioner ændres i Administration, og personlige Indstillinger ligger særskilt.",
    icon: UserRoundIcon,
    screenshot: {
      src: "/help/screenshots/adgang-og-profil.webp",
      alt: "Roller og adgang med handlinger for Administrator, Manager og Medlem",
      caption: "Vælg de handlinger, hver rolle må udføre. De viste rettigheder er et eksempel.",
      width: 1064,
      height: 546,
    },
    appHref: "/profile",
    appLinkLabel: "Åbn Profil",
    settingsTitle: "Rolle, lokationer og kiosk",
    settingsIntro: "En synlig side er ikke nok. Rollen skal også tillade den handling, Brugeren skal udføre.",
    settingsHref: "/administration/users/roles",
    settingsLinkLabel: "Åbn Roller og adgang",
    settings: [
      {
        title: "Handlinger og datavisning",
        description: "Vælg rettigheder særskilt for hver rolle. Datavisning styrer, om rollen får detaljer, totaler eller anonymiserede data.",
        href: "/administration/users/roles",
        linkLabel: "Tilpas roller",
      },
      {
        title: "Lokationsadgang",
        description: "Kontrollér den enkelte Brugers adgang efter invitation. Vælg de relevante lokationer eller en operatør, og angiv en begrundelse for ændringen.",
        href: "/administration/users",
        linkLabel: "Kontrollér Brugernes lokationer",
      },
      {
        title: "Fælles tablet eller kiosk",
        description: "Kioskkontoen bindes til én Lokation. Vælg de sider, der skal bruges på enheden, samt startside og tiden til tilbagevenden efter inaktivitet.",
        href: "/administration/kiosk",
        linkLabel: "Opsæt kiosk",
      },
    ],
  },
  {
    slug: "bestilling",
    number: "11",
    label: "Bestilling",
    title: "Klargør data til bestillingsforslag",
    summary:
      "Beregn et bestillingsforslag ud fra forbrug, lager, åbningstider og en valgt buffer. Gennemgå mængderne, og eksportér planen som CSV.",
    prerequisites: [
      "Opret Produkter, enheder og eventuelle ingredienser. Kontrollér produktkoblingerne til salgskilden.",
      "Hold lager og åbningstider ajour. Din rolle skal have adgang til at planlægge bestillinger.",
    ],
    steps: [
      "Åbn Administration → Lokationer, og kontrollér åbningstider og lukkedage. Kontrollér derefter salgsforbindelser og produktkoblinger under Integrationer.",
      "Åbn Administration → Bestilling. Vælg, om Medtag produkter med ingredienser skal være slået til, og gem indstillingerne.",
      "Åbn Bestilling, og vælg Lokation. Angiv Dækning i dage fra 1 til 28, inklusive leveringstiden, og Buffer i % fra 0 til 100.",
      "Gennemgå forslag og eventuelle advarsler om manglende koblinger. Ret mængderne efter behov, og eksportér bestillingen som CSV.",
    ],
    verification: [
      "Kontrollér forslag for et Produkt med kendt forbrug og lager. Manglende salgs- eller enhedskoblinger kan give for lave forslag.",
      "Åbn CSV-filen, og kontrollér Lokation, datoer, Produkter, enheder og mængder, før planen bruges til bestilling.",
    ],
    note: "Indgående leverancer er ikke medregnet i forslaget. Tag højde for allerede bestilte Produkter, før du bestiller igen.",
    icon: ShoppingCartIcon,
    screenshot: {
      src: "/help/screenshots/bestilling.webp",
      alt: "Bestillingsindstillingen Medtag produkter med ingredienser",
      caption: "Vælg, om Bestilling skal medtage Produkter, der selv består af ingredienser.",
      width: 711,
      height: 148,
    },
    appHref: "/ordering",
    appLinkLabel: "Åbn Bestilling",
    settingsTitle: "Grundlaget for forslagene",
    settingsIntro: "Et brugbart forslag kræver korrekte produktkoblinger, lagerbeholdninger og åbningstider.",
    settingsHref: "/administration/ordering",
    settingsLinkLabel: "Åbn bestillingsindstillinger",
    settings: [
      {
        title: "Produkter med ingredienser",
        description: "Vælg, om disse Produkter skal med på bestillingslisten. Kontrollér, at valget passer til det, lokationen faktisk bestiller.",
        href: "/administration/ordering",
        linkLabel: "Vælg Produkter til Bestilling",
      },
      {
        title: "Produktkoblinger og forbrug",
        description: "Salgsdata skal kunne kobles til Produkter og enheder. Forslaget bruger også Staff food og aktiv Waste, så manglende koblinger dér kan påvirke mængderne.",
        href: "/administration/integrations",
        linkLabel: "Kontrollér datakilder",
      },
      {
        title: "Lager og dækning",
        description: "Positiv lagerbeholdning trækkes fra det forventede forbrug med buffer. Dækningen starter i dag og skal også rumme leveringstiden.",
        href: "/count/stock",
        linkLabel: "Kontrollér Lager",
      },
    ],
  },
  {
    slug: "varemodtagelse",
    number: "12",
    label: "Varemodtagelse",
    title: "Registrér de leverede mængder",
    summary:
      "Modtag en transfer eller registrér en manuel levering. Kontrollér Produkter, enheder og faktiske mængder, før leveringen lægges på lager.",
    prerequisites: [
      "Din rolle skal have adgang til at registrere varemodtagelser på modtagerlokationen.",
      "Opret de relevante Produkter og enheder. En transfer skal være oprettet, før den vises som afventende modtagelse.",
    ],
    steps: [
      "Åbn Administration → Varemodtagelse. Slå Transfer til under Følgesedler, hvis modtagelser fra transfers skal kunne få et billede af følgesedlen, og gem indstillingerne.",
      "Åbn Varemodtagelse, og vælg modtagerlokationen. Vælg en afventende transfer, eller åbn Manuel varemodtagelse for en levering uden transfer.",
      "Kontrollér hvert Produkt og den valgte enhed. Angiv den faktisk modtagne mængde. På en transfer kan du bruge Alt modtaget, når den sendte mængde passer, eller angive 0 for en manglende produktlinje.",
      "Tilføj eventuelt ekstra Produkter, en kommentar og et billede af følgesedlen. Vælg Registrér varemodtagelse, gennemgå bekræftelsen, og registrér modtagelsen.",
    ],
    verification: [
      "Kontrollér efter registrering, at en modtaget transfer er fjernet fra listen over afventende modtagelser.",
      "Åbn Lager for modtagerlokationen, og kontrollér de registrerede Produkter og mængder.",
    ],
    note: "En registreret varemodtagelse kan ikke redigeres bagefter. Kontrollér især afvigelser og enheder før bekræftelse.",
    icon: PackageCheckIcon,
    screenshot: {
      src: "/help/screenshots/varemodtagelse.webp",
      alt: "Varemodtagelse med indstillingen for billede af følgeseddel ved Transfer",
      caption: "Aktivér Transfer, hvis varemodtagelser fra transfers skal kunne få et billede af følgesedlen.",
      width: 711,
      height: 201,
    },
    appHref: "/goods-receipts",
    appLinkLabel: "Åbn Varemodtagelse",
    settingsTitle: "Adgang og følgesedler",
    settingsIntro: "Varemodtagelse bruger produktkatalogets enheder og Brugernes lokationsadgang.",
    settingsHref: "/administration/goods-receipts",
    settingsLinkLabel: "Åbn indstillinger for varemodtagelse",
    settings: [
      {
        title: "Billede af følgeseddel",
        description: "Transfer-indstillingen viser et valgfrit billedfelt ved modtagelse af transfers. Manuel varemodtagelse har altid billedfeltet.",
        href: "/administration/goods-receipts",
        linkLabel: "Indstil følgesedler",
      },
      {
        title: "Produkter og enheder",
        description: "Registrér den leverede mængde i den enhed, feltet viser. Kontrollér produktets omregninger, hvis leverandøren bruger en anden pakningsstørrelse.",
        href: "/administration/products",
        linkLabel: "Kontrollér produktets enheder",
      },
      {
        title: "Adgang til modtagelse",
        description: "Giv den relevante rolle adgang til at registrere varemodtagelser, og kontrollér, at Brugeren har adgang til modtagerlokationen.",
        href: "/administration/users/roles",
        linkLabel: "Kontrollér rettigheder",
      },
    ],
  },
];

export function findHelpFeature(slug: string) {
  return helpFeatures.find((feature) => feature.slug === slug);
}
