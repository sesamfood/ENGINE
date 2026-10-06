import type { HelpFeature } from "./help-types";
import {
  ArrowRightLeftIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  LayoutDashboardIcon,
  PackageCheckIcon,
  PrinterIcon,
  ReceiptTextIcon,
  ShoppingCartIcon,
  Trash2Icon,
  UsersRoundIcon,
  UtensilsIcon,
  WalletIcon,
} from "lucide-react";

export const operationFeatures: HelpFeature[] = [
  {
    slug: "dashboard",
    label: "Dashboard",
    summary:
      "Følg nøgletal i widgets, byg egne målinger, del et læselink, og læs Månedsrapport.",
    icon: LayoutDashboardIcon,
    guides: [
      {
        slug: "overblik",
        label: "Overblik",
        summary:
          "Et dashboard samler målinger fra driften og tilsluttede systemer i widgets.",
        appHref: "/dashboard",
        appLinkLabel: "Åbn Dashboard",
        sections: [
          {
            id: "om",
            title: "Sådan fungerer Dashboard",
            paragraphs: [
              "Hver widget viser én måling med en visualisering og en størrelse. Du vælger periode og lokationsvalg øverst. Organisationen kan have flere dashboards med hver sin adgang og standardvisning.",
            ],
          },
          {
            id: "foer-du-starter",
            title: "Datagrundlag og adgang",
            bullets: [
              "Salgsmålinger kræver en salgskilde, eksempelvis OnlinePOS. Arbejdstimer kræver vagtdata fra Workfeed. Google-bedømmelse kræver, at lokationen har et Google-sted.",
              "Visning, redigering, deling, salgstal og Månedsrapport er separate rettigheder. Rollens datavisning kan samle eller anonymisere tallene.",
            ],
          },
        ],
        relatedLinks: [
          { href: "/help/dashboard/widgets", label: "Opret og brug widgets" },
          { href: "/help/dashboard/maanedsrapport", label: "Månedsrapport" },
        ],
      },
      {
        slug: "widgets",
        label: "Opret og brug widgets",
        summary:
          "Opret et dashboard, tilføj widgets, og vælg periode og lokationsvalg.",
        appHref: "/dashboard",
        appLinkLabel: "Åbn Dashboard",
        sections: [
          {
            id: "opsaetning",
            title: "Opret dashboardet",
            steps: [
              "Åbn Dashboard, og opret eller vælg et dashboard i fanerne.",
              "Åbn Dashboardindstillinger med tandhjulet. Angiv navn og de roller, der må se det. Ingen valgte roller betyder alle.",
              "Gør eventuelt dashboardet til standard for organisationen, bestemte roller eller lokationer, og gem.",
            ],
          },
          {
            id: "tilpas",
            title: "Tilføj widgets",
            steps: [
              "Vælg Redigér → Tilføj widget.",
              "Søg efter en måling, og læs dens formel og datakilder. Vælg Opret tilpasset måling for at bygge din egen.",
              "Vælg visualisering og størrelse, og kontrollér Salgskilde, hvis valget vises.",
              "Flyt widgets på plads. Widgettens knapper ændrer visualisering, akse, indhold eller fjerner den.",
              "Vælg Gem som standard for at gemme periode og lokationsvalg, og afslut med Færdig.",
            ],
            screenshot: {
              src: "/help/screenshots/dashboard.webp",
              alt: "Tilføj widget med søgefelt og målinger med formel og datakilder",
              caption:
                "Hver måling viser formel og datakilder. Læs dem, før du vælger.",
              width: 828,
              height: 730,
            },
          },
          {
            id: "laes",
            title: "Læs tallene",
            bullets: [
              "Vælg periode, eksempelvis I dag eller Denne måned, eller Brugerdefineret.",
              "Vælg Lokation, marked eller operatør i lokationsvalget.",
              "Prognoser kan have deres egen faste periode. Det står i målingens beskrivelse.",
              "Opdatér henter nye data fra integrationerne, hvis du har adgang.",
              "En advarsel om mulige dubletter betyder, at samme salg kan komme fra flere salgskilder.",
            ],
          },
        ],
        troubleshooting: [
          {
            question: "Widgetten er tom",
            answer:
              "Kontrollér periode, lokationsvalg og datakilde. En salgsmåling kræver salgsdata, og arbejdstimer kræver vagter.",
          },
          {
            question: "Hvorfor mangler Redigér eller en måling?",
            answer:
              "Din rolle styrer adgang til at redigere dashboards og se salgstal.",
          },
        ],
        relatedLinks: [
          { href: "/help/dashboard/datapunkter", label: "Byg en tilpasset måling" },
          { href: "/help/dashboard/deling", label: "Del et dashboard" },
        ],
      },
      {
        slug: "datapunkter",
        label: "Byg en tilpasset måling",
        summary:
          "Byg en måling ud fra organisationens datasæt, og genbrug den i flere widgets.",
        appHref: "/dashboard",
        appLinkLabel: "Åbn Dashboard",
        sections: [
          {
            id: "start",
            title: "Start målingen",
            steps: [
              "Vælg en Lokation og en periode med kendte data. De bruges i forhåndsvisningen.",
              "Vælg Redigér → Tilføj widget → Opret tilpasset måling. Målinger kan også oprettes under Administration → Målinger.",
              "Angiv Navn (højst 100 tegn) og eventuelt Beskrivelse.",
            ],
          },
          {
            id: "beregning",
            title: "Vælg beregning",
            bullets: [
              "Enkeltmåling: ét mål fra ét datasæt, eksempelvis Waste og Registreringer.",
              "Forhold: tæller divideret med nævner. De kan komme fra forskellige datasæt.",
              "Driftsdatasæt: Waste, Dårlige leveringer, Transfer, Staff food, Vagter og Count. Salgsdatasæt: Dagligt salg, Salgsordrer og Salgslinjer.",
            ],
          },
          {
            id: "filtre",
            title: "Filtre og produktvalg",
            bullets: [
              "Tilføj filter afgrænser på et felt med Er lig med eller Er ikke lig med. Værdier adskilles med komma og skal matche kilden præcist.",
              "Flere filtre skal alle være opfyldt. Flere værdier i ét filter er alternativer.",
              "Med Dimension Produkt kan du vælge Alle, Kun valgte eller Alle undtagen valgte Produkter, også hele kategorier.",
            ],
          },
          {
            id: "gruppering",
            title: "Gruppering",
            bullets: [
              "Dimension opdeler målingen, eksempelvis efter Lokation, Produkt eller kategori.",
              "Tidsopdeling bestemmer afstanden mellem punkterne: Dag, Uge eller Måned.",
              "Grænse (1–50) viser de største grupper og samler resten under Andre.",
            ],
          },
          {
            integration: "workfeed",
            id: "eksempel",
            title: "Eksempel: omsætning pr. planlagt time",
            steps: [
              "Vælg Forhold. Tæller: Dagligt salg og Omsætning. Nævner: Vagter og Timer.",
              "Vælg Lokation som Dimension og Dag som Tidsopdeling.",
              "Kontrollér Forhåndsvisning. 12.000 kr. og 40 timer giver 300 kr. pr. time. Dage uden timer udelades.",
            ],
            screenshot: {
              src: "/help/screenshots/datapunkter.png",
              alt: "Tilpasset måling med omsætning som tæller, planlagte timer som nævner og gruppering efter Lokation og dag",
              caption:
                "Omsætning pr. planlagt time: tæller og nævner fra hvert sit datasæt.",
              width: 1280,
              height: 1400,
            },
          },
          {
            id: "gem",
            title: "Gem og vedligehold",
            bullets: [
              "Vælg Gem og fortsæt, og vælg visualisering og størrelse. Målingen findes derefter under Organisationens målinger.",
              "Liste og Tabel kræver en dimension. Donutdiagram kræver en Enkeltmåling med dimension.",
              "En ændring af målingen opdaterer alle widgets, der bruger den.",
              "Organisationen kan have 50 tilpassede målinger. En måling kan kun slettes, når ingen widgets bruger den.",
            ],
          },
        ],
        troubleshooting: [
          {
            question: "Forhåndsvisningen mangler data",
            answer:
              "Kontrollér periode, Lokation, filtre og produktvalg. Vælg en kortere periode, hvis datamængden er for stor.",
          },
          {
            question: "Hvorfor kan jeg ikke se salgsdatasæt?",
            answer:
              "Salgsdatasæt kræver adgang til salgstal. Målinger med salg markeres Følsom.",
          },
        ],
        relatedLinks: [
          { href: "/administration/metrics", label: "Åbn Målinger" },
        ],
      },
      {
        slug: "deling",
        label: "Del et dashboard",
        summary:
          "Opret et læselink med udløb og adgangskode, og tilbagekald det senere.",
        appHref: "/dashboard",
        appLinkLabel: "Åbn Dashboard",
        sections: [
          {
            id: "opret",
            title: "Opret et link",
            steps: [
              "Gem den periode og det lokationsvalg, linket skal vise, med Gem som standard.",
              "Vælg Del, og giv linket et navn.",
              "Vælg udløb efter 1, 7, 30 eller 90 dage, og angiv en adgangskode på mindst fire tegn. Adgangskoden er påkrævet ved følsomme målinger.",
              "Vælg Opret og kopiér link, og åbn linket for at kontrollere det.",
            ],
          },
          {
            id: "indhold",
            title: "Det viser linket",
            bullets: [
              "Linket viser dashboardets layout, periode og lokationsvalg fra oprettelsen. Tallene opdateres løbende.",
              "Modtageren kan kun læse.",
            ],
          },
          {
            id: "tilbagekald",
            title: "Tilbagekald et link",
            paragraphs: [
              "Åbn Del. Aktive og udløbne links står nederst. Kopiér et aktivt link igen, eller tilbagekald det. Et tilbagekaldt link virker ikke længere.",
            ],
          },
        ],
      },
      {
        slug: "maanedsrapport",
        label: "Månedsrapport",
        summary:
          "Følg månedens nøgletal mod budget, sidste måned og år til dato.",
        appHref: "/dashboard/monthly",
        appLinkLabel: "Åbn Månedsrapport",
        sections: [
          {
            id: "laes",
            title: "Læs rapporten",
            steps: [
              "Vælg Månedsrapport på Dashboard. Vælg Måned og Lokation, eller alle tilgængelige lokationer.",
              "Sammenhold kolonnerne Faktisk, Budget, Afvigelse, Sidste måned og År til dato.",
              "Brug spørgsmålstegnet ved et tal for at se kilde og årsag til manglende data.",
            ],
            bullets: [
              "Rækkerne er Nettoomsætning, Transaktioner, Gennemsnitlig kurv, Vareforbrug, Lønprocent, Bruttoavance, Waste, Husleje, Forbrug, Primære omkostninger, Lokationens EBITDA og Guest Score.",
              "Et tal kan være Estimat, Foreløbig eller Godkendt. Løn er et estimat ud fra vagter, indtil et godkendt beløb findes.",
              "Rapporten kræver adgang til Månedsrapport og datavisningen Detaljer.",
            ],
            screenshot: {
              src: "/help/screenshots/manedsrapport.webp",
              alt: "Månedsrapport for én Lokation med nøgletal i rækker og kolonnerne Faktisk, Budget, Afvigelse, Sidste måned og År til dato",
              caption:
                "Budgettet er angivet, men der er endnu ingen faktiske tal. Spørgsmålstegnet viser kilden eller årsagen. Eksempeldata.",
              width: 1032,
              height: 866,
            },
          },
          {
            id: "budget",
            title: "Angiv budget og godkendte tal",
            steps: [
              "Vælg Redigér budget, vælg Lokation, og angiv budgettet. Vælg Manuelt eller e-conomic som kilde, hvor valget vises. Angiv Kilde eller reference, og vælg Gem budget.",
              "Når måneden er afsluttet, vælger du Godkend månedstal og angiver månedens godkendte beløb med kilde. Hver godkendelse gemmes som en ny revision.",
              "Opdatér data henter nye salg og vagter. Med e-conomic vælger du Opdatér e-conomic og derefter Godkend e-conomic.",
            ],
            bullets: [
              "Budget og godkendte tal kræver adgang til at redigere månedsbudgetter. Tomme felter betyder, at tallet mangler. 0 er et gyldigt beløb.",
            ],
          },
        ],
        relatedLinks: [
          { integration: "economic", href: "/help/integrationer/e-conomic", label: "e-conomic" },
        ],
      },
    ],
  },
  {
    slug: "datomaerkning",
    label: "Datomærkning",
    summary:
      "Print datoetiketter med produktions- og sidste anvendelsesdato.",
    icon: PrinterIcon,
    guides: [
      {
        slug: "overblik",
        label: "Overblik",
        summary:
          "Vælg et Produkt, kontrollér datoen, og print etiketter på en labelprinter eller via enhedens printdialog.",
        appHref: "/date-labels",
        appLinkLabel: "Åbn Datomærkning",
        sections: [
          {
            id: "opsaetning",
            title: "Opsætning",
            steps: [
              "Angiv Holdbarhed på Produkterne under Administration → Produkter.",
              "Åbn Administration → Datomærkning, og vælg Lokation. Vælg Vis alle produkter, eller vælg bestemte Produkter og kategorier. Slå Medtag klokkeslæt til, hvis etiketten skal vise klokkeslæt.",
              "Vælg printer under Printer på hver tablet. På iPad og Android bruges Brother Smooth Print: installér appen, og vælg printermodel, forbindelse og adresse. Vælg Etiketstørrelse, og vælg Print testetiket.",
            ],
            bullets: [
              "Produktvalg og klokkeslæt gælder hele lokationen. Printervalget gælder kun enheden.",
              "Uden Smooth Print bruges enhedens printdialog. Vælg labelprinteren og 100 % skalering.",
            ],
          },
          {
            id: "print",
            title: "Print etiketter",
            steps: [
              "Åbn Datomærkning, og kontrollér Lokation.",
              "Find Produktet med søgning, eller vælg Favoritter. Hjertet gemmer en favorit på enheden.",
              "Kontrollér Produktionsdato og eventuelt Klokkeslæt. Vælg Antal etiketter (1–100), og kontrollér etiketvisningen.",
              "Vælg Print.",
            ],
            bullets: [
              "Har Produktet ingen holdbarhed, angiver du den i timer, dage eller måneder. Husk holdbarheden for produktet gemmer den, hvis du kan administrere Produkter.",
              "Etiketten viser Produkt, produktionstidspunkt og sidste anvendelse.",
            ],
            screenshot: {
              src: "/help/screenshots/datomaerkning.webp",
              alt: "Panelet Print etiket med produktionsdato, antal etiketter og etiketvisning",
              caption:
                "Kontrollér datoerne i etiketvisningen, før du printer. Eksempeldata.",
              width: 320,
              height: 784,
            },
          },
        ],
        troubleshooting: [
          {
            question: "Et Produkt mangler",
            answer:
              "Ryd søgningen, og vælg Alle. Kontrollér derefter produktvalget under Administration → Datomærkning.",
          },
          {
            question: "Etiketten printes forkert",
            answer:
              "Kontrollér Etiketstørrelse og rullen i printeren. Ved printdialogen skal skalering være 100 % uden sidehoved og sidefod.",
          },
        ],
      },
    ],
  },
  {
    slug: "medarbejdere",
    label: "Medarbejdere",
    summary:
      "Find og vedligehold medarbejdere, og se vagtplanen fra Workfeed.",
    icon: UsersRoundIcon,
    guides: [
      {
        slug: "overblik",
        label: "Overblik",
        summary:
          "Find, opret og redigér medarbejdere på den valgte Lokation.",
        appHref: "/employees/directory",
        appLinkLabel: "Åbn Medarbejdere",
        sections: [
          {
            id: "find",
            title: "Find en medarbejder",
            steps: [
              "Åbn Medarbejdere, og vælg Lokation.",
              "Søg efter navnet. Vælg Alle for også at se inaktive medarbejdere.",
            ],
          },
          {
            id: "opret",
            title: "Opret eller redigér",
            steps: [
              "Vælg Opret medarbejder. Udfyld Fornavn og eventuelt Efternavn, og gem. Medarbejderen tilknyttes den valgte Lokation.",
              "Vælg Redigér ved en medarbejder for at ændre navn eller Aktiv.",
            ],
          },
          {
            id: "adgang",
            title: "Adgang",
            paragraphs: [
              "Medarbejdere er personer, der registreres på, eksempelvis i Staff food. De er ikke Brugere og har ikke login. Oprettelse og redigering kræver adgang til organisationens indstillinger og er ikke mulig i kiosktilstand.",
            ],
          },
          {
            integration: "workfeed",
            id: "importerede",
            title: "Medarbejdere fra Workfeed",
            paragraphs: [
              "Medarbejdere fra Workfeed rettes i Workfeed og opdateres ved næste synkronisering.",
            ],
          },
        ],
      },
      {
        integration: "workfeed",
        slug: "vagtplan",
        label: "Vagtplan",
        summary:
          "Se offentliggjorte vagter fra Workfeed for en uge.",
        appHref: "/employees",
        appLinkLabel: "Åbn Vagtplan",
        sections: [
          {
            id: "opsaetning",
            title: "Opsætning",
            steps: [
              "Forbind Workfeed, og kobl hver Lokation til en afdeling.",
              "Vælg Tidszone under Administration → Medarbejdere.",
              "Giv rollerne Se vagtplan og eventuelt Se medarbejderkartotek.",
            ],
          },
          {
            id: "vagtplan",
            title: "Se ugens vagter",
            steps: [
              "Åbn Medarbejdere → Vagtplan, og vælg Lokation.",
              "Skift uge med pilene, vælg en dato, eller vælg Denne uge. På små skærme vælger du dag.",
            ],
            bullets: [
              "Vagter rettes og offentliggøres i Workfeed.",
              "Visningen er afgrænset betyder, at ikke alle vagter kunne vises. Se resten i Workfeed.",
            ],
          },
          {
            id: "opdatering",
            title: "Synkronisering",
            paragraphs: [
              "Vagtplanen viser de senest hentede data. Vælg Synkronisér nu efter ændringer i Workfeed.",
            ],
          },
        ],
        troubleshooting: [
          {
            question: "Vagterne vises på et forkert tidspunkt",
            answer:
              "Kontrollér tidszonen under Administration → Medarbejdere.",
          },
        ],
        relatedLinks: [
          { integration: "workfeed", href: "/help/integrationer/workfeed", label: "Workfeed" },
        ],
      },
    ],
  },
  {
    slug: "transfer",
    label: "Transfer",
    summary:
      "Send Produkter mellem lokationer, og følg dem frem til modtagelse.",
    icon: ArrowRightLeftIcon,
    guides: [
      {
        slug: "overblik",
        label: "Overblik",
        summary:
          "En transfer registrerer de Produkter, én Lokation sender til en anden.",
        appHref: "/transfers",
        appLinkLabel: "Opret Transfer",
        sections: [
          {
            id: "om",
            title: "Sådan fungerer Transfer",
            paragraphs: [
              "Afsenderen opretter transferen. Modtageren registrerer de faktiske mængder under Varemodtagelse. Først da flyttes mængderne på lageret.",
            ],
          },
          {
            id: "foer-du-starter",
            title: "Før du starter",
            bullets: [
              "Begge lokationer og Produkterne skal findes. Kontrollér Produkternes enheder og Maksimal temperatur.",
              "Afsenderen skal kunne oprette transfers, og modtageren skal kunne registrere varemodtagelser på sin Lokation.",
            ],
          },
        ],
      },
      {
        slug: "opret",
        label: "Opret en transfer",
        summary:
          "Registrér Produkter, mængder og temperaturer for det, der sendes.",
        appHref: "/transfers",
        appLinkLabel: "Opret Transfer",
        sections: [
          {
            id: "registrering",
            title: "Udfyld transferen",
            steps: [
              "Vælg Fra lokation og Til lokation, ansvarlig Bruger og tidspunkt.",
              "Søg Produktet frem, vælg enhed, og angiv mængden. Tilføj en ekstra enhed på samme Produkt, hvis du sender både kasser og løse stk.",
              "Angiv temperaturer, tilføj en kommentar, og gem.",
            ],
            screenshot: {
              src: "/help/screenshots/transfer.webp",
              alt: "Ny transfer fra én Lokation til en anden med produktlinjer, enheder, mængder og temperatur",
              caption:
                "Produkter med Maksimal temperatur kræver en temperaturmåling. Eksempeldata.",
              width: 1020,
              height: 800,
            },
          },
          {
            id: "temperatur",
            title: "Temperatur",
            bullets: [
              "Temperatur er påkrævet for Produkter med Maksimal temperatur. Angiv højst én decimal.",
              "Overstiger målingen maksimum, skal du skrive en kommentar og bekræfte afvigelsen.",
            ],
          },
        ],
        troubleshooting: [
          {
            question: "Produktet eller enheden mangler",
            answer:
              "Kontrollér Produktet under Administration → Produkter. En enhed kan kun bruges én gang pr. Produkt i samme transfer.",
          },
        ],
        relatedLinks: [
          { href: "/help/varemodtagelse/transfer", label: "Modtag en transfer" },
        ],
      },
      {
        slug: "historik",
        label: "Transferhistorik og eksport",
        summary:
          "Find en transfer, ret den før modtagelse, og eksportér til CSV.",
        appHref: "/transfers/history",
        appLinkLabel: "Åbn Transferhistorik",
        sections: [
          {
            id: "find",
            title: "Find en transfer",
            steps: [
              "Vælg Fra dato og Til dato i Transferhistorik.",
              "Åbn transferen for at se afsender, modtager, temperaturer og status. Efter modtagelse vises både sendt og modtaget mængde.",
            ],
          },
          {
            id: "ret",
            title: "Ret eller slet",
            bullets: [
              "Redigér transfer og Slet transfer er mulige, indtil varemodtagelsen er registreret.",
              "Sletning kræver bekræftelse og kan ikke fortrydes.",
            ],
          },
          {
            id: "csv",
            title: "Eksportér til CSV",
            steps: [
              "Vælg periode, og vælg Eksportér til CSV.",
              "Vælg kolonner og rækkefølge. Vælg, om mængder skal omregnes til standardenheden.",
              "Eksportér.",
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "faktura",
    label: "Faktura",
    summary:
      "Registrér salg fra en kvittering, og træk Produkterne fra lageret.",
    icon: ReceiptTextIcon,
    guides: [
      {
        slug: "overblik",
        label: "Overblik",
        summary:
          "Registrér salg, der ikke kommer fra et kassesystem, så lageret passer.",
        appHref: "/invoices",
        appLinkLabel: "Åbn Faktura",
        sections: [
          {
            id: "registrer",
            title: "Registrér en kvittering",
            steps: [
              "Åbn Faktura → Ny kvittering. Vælg Lokation, og angiv Titel og Dato og tidspunkt fra kvitteringen.",
              "Søg Produkter eller menuer frem, og tilføj dem. Vælg enhed og mængde for hver linje. Ved en menu angiver du antal menuer og vælger Produkterne i hver gruppe.",
              "Tilføj eventuelt Kommentar og Billede af kvittering.",
              "Vælg Registrér kvittering, og bekræft med Registrér og træk fra lager.",
            ],
            bullets: [
              "Salg fra før et Produkts seneste Count er allerede talt med og trækkes ikke fra igen.",
              "En kvittering kan have højst 100 produktlinjer og kan ikke redigeres eller slettes bagefter.",
              "Menuer kræver OnlinePOS-menuer under Administration → Produkter.",
            ],
            screenshot: {
              src: "/help/screenshots/faktura.webp",
              alt: "Ny kvittering med lokation, titel, dato og produktlinjer",
              caption:
                "Mængderne trækkes fra lageret, når kvitteringen registreres. Eksempeldata.",
              width: 1020,
              height: 800,
            },
          },
          {
            id: "historik",
            title: "Find en kvittering",
            paragraphs: [
              "Registrerede kvitteringer viser titel, dato, Lokation og hvem der registrerede. Åbn en kvittering for at se produktlinjer og billede.",
            ],
          },
          {
            id: "adgang",
            title: "Adgang",
            paragraphs: [
              "Registrering og visning er separate rettigheder. Faktura slås til under Administration → Faktura.",
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "udgift",
    label: "Udgift",
    summary:
      "Registrér udgifter med bilag, send dem til bogholderiet, og opret dem i e-conomic.",
    icon: WalletIcon,
    guides: [
      {
        slug: "overblik",
        label: "Overblik",
        summary:
          "Registrér en udgift med bilag. Den sendes som e-mail og kan oprettes som kladde i e-conomic.",
        appHref: "/expenses",
        appLinkLabel: "Åbn Udgift",
        sections: [
          {
            id: "opsaetning",
            title: "Opsætning",
            steps: [
              "Åbn Administration → Udgift. Tilføj, omdøb, sortér eller slet kategorier.",
              "Angiv modtagere i Til, CC og BCC. Tomme felter slår e-mails fra.",
              "Med e-conomic slår du Brug til udgifter til for aftalen og angiver Kassekladdenummer, Modkonto, Momskode ved 25 % moms og en udgiftskonto for hver kategori. Gem indstillinger.",
            ],
            bullets: [
              "Opsætningen kræver adgang til alle lokationer. Gemte udgifter beholder deres kategorinavn.",
            ],
          },
          {
            id: "registrer",
            title: "Registrér en udgift",
            steps: [
              "Åbn Udgift → Opret udgift. Vælg Lokation og Kategori.",
              "Angiv Leverandør / modtager, Beløb ekskl. moms, Moms (25 % eller 0 %), Dato og Periode. Tilføj eventuelt en kommentar.",
              "Upload bilaget som PDF, JPG eller PNG på højst 10 MB.",
              "Markér Opret også i e-conomic, hvis udgiften skal oprettes som kladde. Vælg Registrér udgift.",
            ],
            screenshot: {
              src: "/help/screenshots/udgift.webp",
              alt: "Opret udgift med lokation, kategori, leverandør, beløb, moms og dato",
              caption:
                "Kontering viser lokation, kategori og beløb inkl. moms før registrering. Eksempeldata.",
              width: 1032,
              height: 750,
            },
          },
          {
            id: "status",
            title: "Følg status",
            bullets: [
              "Udgifter viser hver udgift med status for e-mail og e-conomic.",
              "Fejler e-conomic, kan du åbne udgiften og vælge Prøv e-conomic igen. Kontrollér i e-conomic betyder, at udgiften muligvis er oprettet. Se efter, før du prøver igen.",
              "Kladden skal kontrolleres og bogføres i e-conomic.",
            ],
          },
        ],
        relatedLinks: [
          { integration: "economic", href: "/help/integrationer/e-conomic", label: "e-conomic" },
        ],
      },
    ],
  },
  {
    slug: "varemodtagelse",
    label: "Varemodtagelse",
    summary:
      "Modtag transfers og andre leveringer, og læg mængderne på lager.",
    icon: PackageCheckIcon,
    guides: [
      {
        slug: "overblik",
        label: "Overblik",
        summary:
          "Varemodtagelse lægger leverede mængder på lager.",
        appHref: "/goods-receipts",
        appLinkLabel: "Åbn Varemodtagelse",
        sections: [
          {
            id: "om",
            title: "Sådan fungerer Varemodtagelse",
            paragraphs: [
              "Åbn en afventende transfer, når leveringen kommer fra en anden Lokation. Brug Manuel varemodtagelse til alle andre leveringer. En registreret varemodtagelse kan ikke redigeres.",
            ],
          },
          {
            id: "foer-du-starter",
            title: "Før du starter",
            bullets: [
              "Rollen skal kunne registrere varemodtagelser på lokationen.",
              "Produkterne skal have enheder, så leverandørens pakninger kan omregnes.",
              "Under Administration → Varemodtagelse vælger du, om modtagelse af transfers skal have et felt til billede af følgesedlen. Manuel varemodtagelse har altid feltet.",
            ],
          },
        ],
      },
      {
        slug: "transfer",
        label: "Modtag en transfer",
        summary:
          "Registrér de faktisk leverede mængder på modtagerlokationen.",
        appHref: "/goods-receipts",
        appLinkLabel: "Åbn Varemodtagelse",
        sections: [
          {
            id: "kontroller",
            title: "Kontrollér leveringen",
            steps: [
              "Vælg Lokation under Varemodtagelse, og åbn den afventende transfer.",
              "Angiv den modtagne mængde for hver linje. Alt modtaget udfylder de sendte mængder. Angiv 0 for en manglende linje.",
              "Tilføj ekstra Produkter, hvis leveringen indeholder mere end transferen. Tilføj eventuelt kommentar og billede af følgesedlen.",
            ],
            screenshot: {
              src: "/help/screenshots/varemodtagelse.webp",
              alt: "Modtagelse af en transfer med sendte og modtagne mængder pr. produktlinje",
              caption:
                "Angiv det, der faktisk er leveret. Afvigelser vises før registrering. Eksempeldata.",
              width: 1204,
              height: 800,
            },
          },
          {
            id: "registrer",
            title: "Registrér",
            paragraphs: [
              "Vælg Registrér varemodtagelse, læs antallet af afvigelser, og bekræft. Mængderne lægges på lager, og transferen låses.",
            ],
          },
        ],
        troubleshooting: [
          {
            question: "Hvorfor mangler transferen?",
            answer:
              "Kontrollér Lokation og din adgang. Transferen kan allerede være modtaget.",
          },
        ],
      },
      {
        slug: "manuel",
        label: "Registrér en manuel levering",
        summary:
          "Læg en levering på lager, når der ikke er en transfer.",
        appHref: "/goods-receipts/manual",
        appLinkLabel: "Åbn Manuel varemodtagelse",
        sections: [
          {
            id: "registrer",
            title: "Opret varemodtagelsen",
            steps: [
              "Åbn Manuel varemodtagelse, og kontrollér Lokation og tidspunkt.",
              "Tilføj Produkterne, vælg enhed, og angiv mængden.",
              "Tilføj eventuelt billede af følgesedlen og en kommentar.",
              "Vælg Registrér varemodtagelse, og bekræft.",
            ],
            bullets: [
              "Brug Produktets enhed, ikke kun tallet på pakningen.",
              "Én modtagelse kan have højst 200 linjer.",
            ],
          },
        ],
        relatedLinks: [
          { href: "/help/waste/daarlig-levering", label: "Dokumentér en dårlig levering" },
        ],
      },
    ],
  },
  {
    slug: "count",
    label: "Count",
    summary:
      "Tæl lageret, afstem beholdningen, og undersøg afvigelser.",
    icon: ClipboardListIcon,
    guides: [
      {
        slug: "overblik",
        label: "Overblik",
        summary:
          "Count afstemmer den registrerede beholdning med det, der fysisk er på lokationen.",
        appHref: "/count",
        appLinkLabel: "Åbn Count",
        sections: [
          {
            id: "om",
            title: "Sådan fungerer Count",
            paragraphs: [
              "Produkterne tælles i lokationens Områder og rækkefølge. Når Count registreres, overskrives lageret for de optalte Produkter. Afvigelser siden forrige Count kan eksporteres som Waste-rapport.",
            ],
          },
          {
            id: "foer-du-starter",
            title: "Før du starter",
            bullets: [
              "Produkterne skal have korrekte enheder.",
              "Vælg lokationens Produkter og Områder under Administration → Lokationer.",
              "Åbningstiderne skal være ajour, fordi de styrer Count-vinduet.",
            ],
          },
        ],
      },
      {
        slug: "udfoer",
        label: "Planlæg og udfør Count",
        summary:
          "Vælg Count-vindue, tæl Produkterne, og registrér lagerafstemningen.",
        appHref: "/count",
        appLinkLabel: "Åbn Count",
        sections: [
          {
            id: "count-vindue",
            title: "Count-vindue",
            steps: [
              "Åbn Administration → Count, og vælg Count-frekvens og Count-dag, eller interval og første dato.",
              "Vælg Tillad Count uden for Count-vinduet, Kræv Count før åbning og Lås andre funktioner under Count. Gem.",
              "Vælg eventuelt Produkter, der aldrig tælles, under Udelad fra Count.",
            ],
            bullets: [
              "Count-vinduet åbner ved lukketid på Count-dagen. Det lukker ved næste åbning, eller når Count er registreret, hvis Count kræves før åbning.",
              "Med lås er kun Count, Waste og Administration tilgængelige, indtil Count er registreret.",
            ],
          },
          {
            id: "tael",
            title: "Tæl",
            steps: [
              "Åbn Count, og vælg Lokation og eventuelt Område. Du kan se, om andre tæller i samme Område.",
              "Vælg Ét Produkt ad gangen for at følge ruten, eller Alle Produkter for at søge.",
              "Angiv mængden i den enhed, du tæller. Brug flere enheder, hvis du tæller både hele pakninger og løse mængder.",
              "Vælg Færdig efter sidste Produkt, og fortsæt i næste Område.",
            ],
            bullets: [
              "Redigér rækkefølge ændrer rækkefølgen i et Område, hvis du kan administrere lokationer.",
            ],
            screenshot: {
              src: "/help/screenshots/count.webp",
              alt: "Count på en Lokation med produktlinjer og optalte mængder",
              caption:
                "Et tomt felt bevarer lageret. 0 betyder, at der ikke er noget. Eksempeldata.",
              width: 1204,
              height: 800,
            },
          },
          {
            id: "afslut",
            title: "Registrér Count",
            steps: [
              "Kontrollér mængder og enheder.",
              "Vælg Registrér Count, skriv en begrundelse, og bekræft.",
            ],
            bullets: [
              "Lageret overskrives for Produkter med en mængde. Tomme felter bevarer lageret.",
              "En registreret Count kan ikke rettes.",
            ],
          },
        ],
        troubleshooting: [
          {
            question: "Count-vinduet er lukket",
            answer:
              "Se nedtællingen. Kontrollér åbningstiderne og Count-indstillingerne, hvis tidspunktet er forkert.",
          },
          {
            question: "Et Produkt mangler",
            answer:
              "Ryd søgningen. Kontrollér derefter lokationens Produkter og Områder, og om Produktet er udeladt fra Count.",
          },
        ],
      },
      {
        slug: "lager-og-rapport",
        label: "Lager og afvigelser",
        summary:
          "Se lagerbeholdningen, og eksportér afvigelser mellem to Count-registreringer.",
        appHref: "/count/stock",
        appLinkLabel: "Åbn Lager",
        sections: [
          {
            id: "lager",
            title: "Lager",
            paragraphs: [
              "Åbn Count → Lager, og vælg Lokation. Vælg Kort eller Detaljer. Lageret ændres af Count, varemodtagelser, Waste, Staff food, Faktura og salg, når lagersynkronisering er slået til.",
            ],
          },
          {
            id: "salgskilde",
            title: "Salgskilde",
            paragraphs: [
              "Vælg under Administration → Count → Salgskilde til Count, hvilken aktiveret salgskilde hver Lokation bruger i rapporten.",
            ],
          },
          {
            id: "eksport",
            title: "Eksportér afvigelser",
            steps: [
              "Åbn den registrerede Count, og vælg Eksportér Waste. Det kræver en tidligere Count.",
              "Læs advarslerne om salgskilde og produktkoblinger.",
              "Sammenhold forventet beholdning, salg, optalt beholdning og Waste i CSV-filen.",
            ],
            bullets: [
              "Manglende salg eller produktkoblinger giver forkerte afvigelser.",
              "Er der ingen afvigelser, dannes ingen fil.",
            ],
          },
        ],
        relatedLinks: [
          { href: "/help/waste/rapport", label: "Løbende Waste-registreringer" },
        ],
      },
    ],
  },
  {
    slug: "waste",
    label: "Waste",
    summary:
      "Registrér kasserede Produkter og dårlige leveringer, og følg op i rapporten.",
    icon: Trash2Icon,
    guides: [
      {
        slug: "overblik",
        label: "Overblik",
        summary:
          "Waste trækker kasserede mængder fra lageret. Dårlig levering dokumenterer en afvist levering.",
        appHref: "/waste",
        appLinkLabel: "Registrér Waste",
        sections: [
          {
            id: "om",
            title: "Sådan fungerer Waste",
            paragraphs: [
              "Lokationens Produkter vælges under Produkter og Områder. Genveje gør det muligt at registrere en almindelig mængde med ét tryk. Fejl kan fortrydes straks eller annulleres i rapporten.",
            ],
          },
        ],
      },
      {
        slug: "registrering",
        label: "Registrér Waste",
        summary:
          "Registrér kasserede mængder, tilpas genveje, og fortryd fejl.",
        appHref: "/waste",
        appLinkLabel: "Registrér Waste",
        sections: [
          {
            id: "opsaetning",
            title: "Opsætning",
            bullets: [
              "Administration → Waste: Nulstil efter inaktivitet rydder søgning og dialoger på fælles tablets.",
              "Popularitetsperiode og Brug historik fra hele organisationen bestemmer de anbefalede mængdegenveje.",
            ],
          },
          {
            id: "registrer",
            title: "Registrér",
            steps: [
              "Kontrollér Lokation, og find Produktet med søgning eller kategori.",
              "Tryk på en mængdegenvej for at registrere mængden med det samme.",
              "Åbn Produktet for en anden mængde, vælg enhed, og vælg Registrér Waste.",
            ],
            screenshot: {
              src: "/help/screenshots/waste.webp",
              alt: "Registrér Waste med produktkort og mængdegenveje",
              caption:
                "En genvej registrerer den viste mængde med det samme. Kontrollér tal og enhed. Eksempeldata.",
              width: 1204,
              height: 800,
            },
          },
          {
            id: "genveje",
            title: "Genveje",
            bullets: [
              "Med adgang til Waste-indstillinger kan du fastgøre Produkter og vælge Redigér genveje i produktdialogen.",
              "Gem en eller to genveje med mængde og enhed. Brug anbefalede mængder går tilbage til historikken.",
            ],
          },
          {
            id: "fortryd",
            title: "Fortryd",
            paragraphs: [
              "Vælg Fortryd i beskeden eller nederst på siden, mens det er muligt. Senere skal registreringen annulleres i Waste-rapporten.",
            ],
          },
        ],
      },
      {
        slug: "daarlig-levering",
        label: "Dårlige leveringer",
        summary:
          "Dokumentér en dårlig levering med billeder, og send en automatisk meddelelse.",
        appHref: "/waste/bad-delivery",
        appLinkLabel: "Åbn Dårlig levering",
        sections: [
          {
            id: "opsaetning",
            title: "Opsætning",
            steps: [
              "Åbn Administration → Waste → Dårlige leveringer.",
              "Vælg Træk som standard fra lager og Vis valget ved registrering. Træk kun fra, hvis Produkterne allerede er lagt på lager.",
              "Udfyld Til, E-mailens emne og E-mailens indhold. Skabelonen kan bruge {location}, {products} og {comment}. Tom Til slår meddelelser fra. Gem.",
            ],
          },
          {
            id: "dokumenter",
            title: "Registrér",
            steps: [
              "Åbn Waste → Dårlig levering, og kontrollér Lokation.",
              "Tag et billede af Produkterne og af følgesedlen. Begge er påkrævede.",
              "Tilføj Produkter, enheder og mængder, og eventuelt en kommentar.",
              "Vælg Gennemse og registrér, og derefter Bekræft registrering.",
            ],
          },
          {
            id: "meddelelse",
            title: "Meddelelse",
            paragraphs: [
              "Åbn registreringen under Waste → Rapport → Dårlige leveringer for at se billeder og meddelelsens status. Fejlede meddelelsen, kan du vælge Send oprindelig meddelelse, når fejlen er rettet.",
            ],
          },
        ],
      },
      {
        slug: "rapport",
        label: "Waste-rapport",
        summary:
          "Find registreringer, eksportér, og annullér fejl med en begrundelse.",
        appHref: "/waste/report",
        appLinkLabel: "Åbn Waste-rapport",
        sections: [
          {
            id: "find",
            title: "Find registreringer",
            steps: [
              "Vælg Fra, Til og Lokation eller Alle lokationer.",
              "Oversigt viser mængder pr. Lokation, Produkt og enhed. Registreringer viser hver registrering med kilde og status.",
            ],
          },
          {
            id: "annuller",
            title: "Annullér",
            steps: [
              "Åbn registreringen, vælg Annullér registrering, og skriv en begrundelse.",
              "Bekræft. Mængden føres tilbage på lageret, og status bliver Annulleret.",
            ],
            bullets: [
              "Refunderinger fra salgssystemet kan ikke annulleres her.",
            ],
          },
          {
            id: "eksport",
            title: "Eksportér",
            bullets: [
              "Eksportér oversigt giver de samlede mængder. Eksportér registreringer giver hver registrering.",
              "Rapportvisning og eksport er separate rettigheder.",
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "staff-food",
    label: "Staff food",
    summary:
      "Registrér medarbejdernes Staff food ud fra vagtlængde og regler.",
    icon: UtensilsIcon,
    guides: [
      {
        slug: "overblik",
        label: "Overblik",
        summary:
          "En regel bestemmer, hvilke Produkter en medarbejder kan vælge, og hvor mange, ud fra vagtlængden.",
        appHref: "/staff-food",
        appLinkLabel: "Åbn Staff food",
        sections: [
          {
            id: "om",
            title: "Sådan fungerer Staff food",
            paragraphs: [
              "Medarbejderen vælges ud fra sin vagt eller en erstatningsvagt. Reglen med den højeste opfyldte vagtlængde gælder. Reglerne lægges ikke sammen. Registreringen trækker Produkterne fra lageret.",
            ],
          },
        ],
      },
      {
        slug: "registrering",
        label: "Regler og registrering",
        summary:
          "Opret regler, registrér Staff food, og eksportér registreringer.",
        appHref: "/staff-food",
        appLinkLabel: "Åbn Staff food",
        sections: [
          {
            id: "regler",
            title: "Opret en regel",
            steps: [
              "Åbn Administration → Staff food, og vælg Ny regel.",
              "Angiv Minimum vagtlængde i timer (0,5–24 i halve timer).",
              "Vælg Tilføj kategorigruppe. Vælg en eller flere kategorier, angiv Antal (1–20), og vælg de tilladte Produkter. Produkterne i gruppen deler antallet.",
              "Gem. Opret flere regler for længere vagter.",
            ],
            screenshot: {
              src: "/help/screenshots/staff-food.webp",
              alt: "Ny Staff food-regel med minimum vagtlængde, en kategorigruppe, antal og tilladte Produkter",
              caption:
                "Produkterne i en kategorigruppe deler antallet. Eksempeldata.",
              width: 1040,
              height: 659,
            },
          },
          {
            id: "registrer",
            title: "Registrér",
            steps: [
              "Kontrollér Lokation, og vælg medarbejderen under På vagt nu, eller søg.",
              "Vælg Produkter og antal. Tallet ved kategorien viser, hvad der er tilbage i dag.",
              "Vælg Registrér Staff food, og derefter Bekræft registrering.",
            ],
          },
          {
            id: "erstatningsvagt",
            title: "Uden aktiv vagt",
            paragraphs: [
              "Søg medarbejderen frem, og vælg Erstatningsvagt. Angiv vagtens samlede længde, og vælg Fortsæt. Erstatningsvagten gælder resten af dagen på lokationen.",
            ],
          },
          {
            id: "fortryd",
            title: "Fortryd og eksportér",
            bullets: [
              "Fortryd i beskeden efter registrering annullerer med en begrundelse og fører lageret tilbage.",
              "Administration → Staff food → Eksportér registreringer henter registreringer for op til ét år som CSV.",
            ],
          },
        ],
        troubleshooting: [
          {
            question: "Jeg kan ikke vælge flere Produkter",
            answer:
              "Produkterne i en kategorigruppe deler antallet, også med dagens tidligere registreringer.",
          },
          {
            question: "Vagten udløser ingen regel",
            answer:
              "Vagten er kortere end den korteste regel. Kontrollér vagtlængden og reglerne.",
          },
        ],
      },
    ],
  },
  {
    slug: "egenkontrol",
    label: "Egenkontrol",
    summary:
      "Planlæg kontroller, registrér målinger, følg op på afvigelser, og hent dokumentation.",
    icon: ClipboardCheckIcon,
    guides: [
      {
        slug: "overblik",
        label: "Overblik",
        summary:
          "Egenkontrol samler de kontroller, lokationerne skal udføre, og dokumentationen for dem.",
        appHref: "/own-checks",
        appLinkLabel: "Åbn dagens egenkontroller",
        sections: [
          {
            id: "om",
            title: "Sådan fungerer Egenkontrol",
            paragraphs: [
              "En egenkontrol beskriver opgaven, felterne og grænserne. Tidsplanen bestemmer, hvornår den vises under I dag. Afvigelser følges op og godkendes under Oversigt. Dokumentation samler perioden i PDF eller CSV. Vejledning linker til myndighedernes vejledning om risici og HACCP.",
            ],
          },
          {
            id: "foer-du-starter",
            title: "Før du starter",
            bullets: [
              "Lokationernes tidszoner skal være korrekte.",
              "Udførelse, rettelse, korrigerende handling, godkendelse og eksport er separate rettigheder.",
            ],
          },
        ],
      },
      {
        slug: "udfoer",
        label: "Opret og udfør egenkontroller",
        summary:
          "Opret kontrollens felter og tidsplan, og registrér den daglige udførelse.",
        appHref: "/own-checks",
        appLinkLabel: "Åbn dagens egenkontroller",
        sections: [
          {
            id: "skabelon",
            title: "Opret en egenkontrol",
            steps: [
              "Åbn Administration → Egenkontrol, og opret en egenkontrol. Angiv Navn, kontroltype, Beskrivelse, Instruktioner og eventuelt et billede.",
              "Tilføj felter: Tal med enhed og grænser, Punkt, Valg, Tekst eller Fil. Markér Påkrævet efter behov.",
              "Slå Produkttemperaturer til, hvis der skal måles en temperatur for hvert Produkt.",
              "Vælg Frekvens: Dagligt, Ugentligt, Månedligt eller Fast interval. Angiv Starter kl. og Forfalder kl. samt lokationer.",
              "Vælg eventuelt Ansvarlig rolle. Den bruges til visning og filtrering. Gem.",
            ],
            bullets: [
              "Ændringer gemmes som nye versioner. Historiske kontroller bevarer deres felter.",
              "Arkivér stopper nye datoer. En arkiveret egenkontrol kan gendannes.",
            ],
          },
          {
            id: "faelles-regler",
            title: "Fælles regler",
            bullets: [
              "Frist for efterregistrering angiver, hvor mange dage en kontrol kan registreres bagefter. 0 betyder kun samme dag.",
              "Godkendelse kræver en anden person forhindrer, at man godkender sin egen kontrol. Brugere, der administrerer egenkontroller, er undtaget.",
              "Blokér egenkontrol under Count stopper registrering, mens Count låser lokationen.",
            ],
          },
          {
            id: "registrer",
            title: "Udfør en kontrol",
            steps: [
              "Åbn Egenkontrol → I dag, og kontrollér Lokation. Mangler, Afvigelser, Udført i dag og Manglende fra tidligere dage viser status.",
              "Åbn kontrollen, og læs instruktionerne.",
              "Udfyld felterne. Felter med stjerne er påkrævede. Vent på, at filer er uploadet.",
              "Ved en afvigelse beskriver du den og eventuelt den korrigerende handling. Vælg Registrér egenkontrol eller Registrér afvigelse.",
            ],
            screenshot: {
              src: "/help/screenshots/egenkontrol.webp",
              alt: "Egenkontrol I dag med en manglende kontrol under Mangler",
              caption:
                "Start fra I dag. Afvigelser og manglende kontroller fra tidligere dage vises særskilt. Eksempeldata.",
              width: 1020,
              height: 440,
            },
          },
        ],
        troubleshooting: [
          {
            question: "Der er ingen kontroller i dag",
            answer:
              "Kontrollér Lokation, og kontrollér egenkontrollens lokationer, startdato og frekvens under Administration → Egenkontrol.",
          },
          {
            question: "Kontrollen kan ikke registreres",
            answer:
              "Den ligger i fremtiden, efter fristen for efterregistrering, eller Count blokerer Egenkontrol.",
          },
        ],
      },
      {
        slug: "opfoelgning",
        label: "Følg op og godkend",
        summary:
          "Registrér korrigerende handlinger, ret registreringer, og godkend.",
        appHref: "/own-checks/overview",
        appLinkLabel: "Åbn Oversigt",
        sections: [
          {
            id: "find",
            title: "Find kontrollen",
            steps: [
              "Åbn Egenkontrol → Oversigt. Vælg Lokation og en periode på højst 92 dage.",
              "Afgræns med Kontroltype, Status eller Ansvarlig bruger, og åbn kontrollen.",
            ],
          },
          {
            id: "handling",
            title: "Følg op og godkend",
            steps: [
              "Skriv Korrigerende handling, og vælg Registrér handling. En eksisterende handling kan erstattes med en begrundelse.",
              "Vælg Godkend egenkontrol, når afvigelsen er fulgt op.",
            ],
          },
          {
            id: "rettelser",
            title: "Ret en registrering",
            paragraphs: [
              "Vælg Ret registrering, ret værdierne, og skriv Begrundelse for rettelse. Rettelsen gemmes som en ny revision. Godkendte kontroller kan ikke rettes.",
            ],
          },
        ],
      },
      {
        slug: "dokumentation",
        label: "Hent dokumentation",
        summary:
          "Saml udførte og manglende kontroller for en Lokation i PDF eller CSV.",
        appHref: "/own-checks/documentation",
        appLinkLabel: "Åbn Dokumentation",
        sections: [
          {
            id: "rapport",
            title: "Hent dokumentationen",
            steps: [
              "Åbn Egenkontrol → Dokumentation. Vælg Lokation og en periode på højst 366 dage.",
              "Vælg Vis dokumentation, og vent, til alt er hentet.",
              "Gennemgå kontroller, afvigelser, godkendelser og manglende kontroller. Vælg Hent PDF eller Eksportér CSV.",
            ],
            bullets: [
              "Opdatér dokumentation henter ændringer siden sidst.",
              "Er rapporten for stor, så vælg en kortere periode.",
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "bestilling",
    label: "Bestilling",
    summary:
      "Beregn et bestillingsforslag ud fra forbrug og lager, og gem bestillingen.",
    icon: ShoppingCartIcon,
    guides: [
      {
        slug: "overblik",
        label: "Overblik",
        summary:
          "Bestilling foreslår mængder ud fra forventet forbrug, lager og åbningstider.",
        appHref: "/ordering",
        appLinkLabel: "Åbn Bestilling",
        sections: [
          {
            id: "om",
            title: "Sådan fungerer Bestilling",
            paragraphs: [
              "Du vælger dækning og buffer, retter forslaget og afgiver bestillingen. Den gemmes i Bestillingshistorik. Intet sendes automatisk til en leverandør.",
            ],
          },
          {
            id: "foer-du-starter",
            title: "Før du starter",
            bullets: [
              "Produkter, enheder, ingredienser og salgskoblinger skal være korrekte, og Lager og åbningstider ajour.",
              "Under Administration → Bestilling vælger du, om Produkter med ingredienser skal medtages.",
              "Planlægning, afgivelse og eksport er separate rettigheder.",
            ],
          },
        ],
      },
      {
        slug: "forslag",
        label: "Beregn og afgiv en bestilling",
        summary:
          "Tilpas dækning og buffer, afgiv bestillingen, og find den i historikken.",
        appHref: "/ordering",
        appLinkLabel: "Åbn Bestilling",
        sections: [
          {
            id: "beregn",
            title: "Beregn forslaget",
            steps: [
              "Vælg Lokation. Angiv Dækning i dage (1–28) og Buffer i % (0–100). Dækningen starter i dag og skal rumme leveringstiden.",
              "Sammenhold Lager, Forventet forbrug og Forslag. Spørgsmålstegnet forklarer beregningen.",
              "Ret mængden under Bestil. Brug forslag går tilbage til det beregnede.",
            ],
          },
          {
            id: "grundlag",
            title: "Beregningen",
            bullets: [
              "Forslaget bruger historisk forbrug, åbningstider og lukkedage, og vejr og helligdage når der er nok historik.",
              "Staff food og Waste lægges til. Opskrifter omregnes til ingredienser. Buffer lægges til, og lager trækkes fra.",
              "Indgående leverancer indgår ikke.",
              "Ukendt lager, Intet forbrugsgrundlag og Begrænset datagrundlag kræver din vurdering.",
            ],
          },
          {
            id: "afgiv",
            title: "Afgiv og find bestillingen",
            steps: [
              "Vælg Afgiv bestilling, og bekræft. Alle mængder over nul medtages, højst 500 Produkter.",
              "Find bestillingen i Bestillingshistorik. Vælg periode under Afgivet i perioden.",
              "Eksportér CSV henter én bestilling eller alle bestillinger i perioden.",
            ],
          },
          {
            id: "csv",
            title: "Eksportér uden at afgive",
            paragraphs: [
              "Eksportér CSV på forslaget henter mængderne som fil uden at gemme en bestilling.",
            ],
          },
        ],
        relatedLinks: [
          { href: "/help/count/lager-og-rapport", label: "Lager" },
        ],
      },
    ],
  },
];
