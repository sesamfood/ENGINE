import type { HelpFeature } from "./help-types";
import {
  ArrowRightLeftIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  LayoutDashboardIcon,
  PackageCheckIcon,
  ShoppingCartIcon,
  Trash2Icon,
  UsersRoundIcon,
  UtensilsIcon,
} from "lucide-react";

export const operationFeatures: HelpFeature[] = [
  {
    slug: "dashboard",
    label: "Dashboard",
    summary:
      "Saml de vigtigste målinger, tilpas visningen, og del et læselink.",
    icon: LayoutDashboardIcon,
    guides: [
      {
        slug: "overblik",
        label: "Overblik",
        summary:
          "Saml de vigtigste målinger, tilpas visningen, og del et læselink.",
        appHref: "/dashboard",
        appLinkLabel: "Åbn Dashboard",
        sections: [
          {
            id: "om",
            title: "Sådan fungerer Dashboard",
            paragraphs: [
              "Et dashboard samler målinger fra driften i widgets. Hver widget har en måling, en visualisering og en størrelse. Brug en indbygget måling, eller opret egne datapunkter som en tilpasset måling. Du vælger periode og Lokation, når du vil undersøge tallene.",
            ],
          },
          {
            id: "forloeb",
            title: "Fra opsætning til daglig brug",
            steps: [
              "Opret dashboardet, vælg widgets, og angiv adgang og standardvisning.",
              "Opret eventuelt en tilpasset måling med de datasæt, filtre og grupper, du vil følge. Målingen kan genbruges i flere widgets.",
              "Følg tallene i den relevante periode. Del derefter et læselink, hvis andre skal følge samme overblik.",
            ],
          },
          {
            id: "foer-du-starter",
            title: "Før du starter",
            bullets: [
              "Din rolle skal have adgang til at administrere dashboards for at ændre opsætningen.",
              "Målingerne bruger registreringer og tilsluttede datakilder. Salg kræver en salgskilde, og arbejdstimer kræver Workfeed.",
            ],
          },
        ],
      },
      {
        slug: "widgets",
        label: "Opret og brug widgets",
        summary:
          "Sæt dashboardets indhold og adgang op, og følg tallene for den valgte periode og Lokation.",
        appHref: "/dashboard",
        appLinkLabel: "Åbn Dashboard",
        sections: [
          {
            id: "opsaetning",
            title: "Opret dashboardet",
            steps: [
              "Åbn Dashboard, og vælg eller opret det dashboard, du vil sætte op.",
              "Åbn Dashboardindstillinger med tandhjulet. Angiv navn og de roller, der må se dashboardet. Ingen valgte roller betyder alle roller.",
              "Vælg eventuelt dashboardet som standard for organisationen, bestemte roller eller lokationer. En Lokation kan kun have ét standarddashboard. Gem indstillingerne.",
            ],
          },
          {
            id: "tilpas",
            title: "Tilføj og tilpas widgets",
            steps: [
              "Vælg Redigér og derefter Tilføj widget. På et tomt dashboard kan du vælge Tilføj widget direkte.",
              "Søg efter en indbygget måling eller en af Organisationens målinger. Vælg Opret tilpasset måling under Byg selv, hvis du vil definere egne datapunkter.",
              "Vælg en kompatibel visualisering og en størrelse. Kontrollér Salgskilde, når valget vises.",
              "Flyt widgetten til den ønskede placering. Brug widgettens knapper til at ændre visualisering, redigere eller fjerne den.",
              "Vælg Gem som standard, hvis den aktuelle periode og lokationsvalget skal være dashboardets udgangspunkt. Afslut med Færdig.",
            ],
            screenshot: {
              src: "/help/screenshots/dashboard.webp",
              alt: "Tilføj widget med søgning og valg af måling før visualisering og størrelse",
              caption:
                "Læs målingens beskrivelse, før du går videre. Her står også særlige regler for perioden.",
              width: 828,
              height: 730,
            },
          },
          {
            id: "laes",
            title: "Vælg det, du vil følge",
            steps: [
              "Vælg dashboardet i fanerne øverst.",
              "Vælg Lokation, marked eller operatør i lokationsvælgeren, hvis du har adgang til flere.",
              "Vælg eksempelvis I dag eller Denne måned. Brug Brugerdefineret til en bestemt fra- og til-dato.",
              "Læs målingens beskrivelse, når du vurderer tallene. En prognose kan have sin egen faste periode, selv om dashboardet viser en anden periode.",
            ],
          },
          {
            id: "datagrundlag",
            title: "Kontrollér datagrundlaget",
            bullets: [
              "Vælg én Lokation og en periode med kendte data, og sammenhold tallene med kilden. Salgsmålinger kræver salgsdata, og arbejdstimer kræver Workfeed.",
              "En tom widget kan skyldes den valgte periode, lokationsvalget eller manglende registreringer.",
              "Opdatér kan starte en opdatering af datakilderne, hvis du har integrationsadgang. Opdateringen kan allerede være i gang eller være midlertidigt begrænset.",
              "En advarsel om mulige dubletter kræver, at salgskilderne kontrolleres. Det samme salg kan være registreret i mere end én kilde.",
              "Kontrollér med en Bruger i den relevante rolle, at dashboardets adgang og standardvisning virker som aftalt.",
            ],
          },
        ],
        troubleshooting: [
          {
            question: "Hvorfor mangler Redigér eller en måling?",
            answer:
              "Din rolle styrer adgang til dashboardopsætning og følsomme målinger. Bed en Administrator kontrollere rollen, hvis du mangler en nødvendig handling.",
          },
        ],
        relatedLinks: [
          {
            href: "/help/dashboard/datapunkter",
            label: "Opret egne datapunkter",
          },
          {
            href: "/help/dashboard/deling",
            label: "Del et dashboard",
          },
          {
            href: "/help/integrationer",
            label: "Integrationer og datakilder",
          },
        ],
      },
      {
        slug: "datapunkter",
        label: "Opret egne datapunkter",
        summary:
          "Byg en tilpasset måling fra organisationens data, og brug den i en eller flere widgets.",
        appHref: "/dashboard",
        appLinkLabel: "Åbn Dashboard",
        sections: [
          {
            id: "start",
            title: "Start en tilpasset måling",
            paragraphs: [
              "Egne datapunkter oprettes som en tilpasset måling. Du vælger datagrundlag, beregning og gruppering; appen henter værdierne fra organisationens registreringer og integrationer.",
            ],
            steps: [
              "Vælg en Lokation og en periode med kendte data på dashboardet. De bruges i forhåndsvisningen.",
              "Vælg Redigér → Tilføj widget. Under Måling vælger du Byg selv → Opret tilpasset måling.",
              "Giv målingen et entydigt Navn på højst 100 tegn. Tilføj eventuelt en Beskrivelse på højst 500 tegn, som forklarer, hvad tallet viser.",
            ],
          },
          {
            id: "beregning",
            title: "Vælg, hvad der skal beregnes",
            steps: [
              "Vælg Enkeltmåling for ét mål fra ét datasæt. Vælg derefter Datasæt og Mål, eksempelvis Waste og Registreringer.",
              "Vælg Forhold for at dele én måling med en anden. Angiv Datasæt og Mål særskilt for Tæller og Nævner. De kan komme fra forskellige datasæt.",
            ],
            bullets: [
              "Driftsdata findes i Waste, Dårlige leveringer, Transfer, Staff food, Vagter og Count. Vagter kommer fra Workfeed.",
              "Salgsdata findes i Dagligt salg, Salgsordrer, Salgslinjer, Wolt-ordrer og Wolt-ordrelinjer. Vælg det datasæt, der dækker det salg, du vil følge.",
              "Datasættet bestemmer de mulige mål, filtre og dimensioner. Et Forhold beregnes som tæller divideret med nævner. Periodens samlede værdi beregnes af de samlede tal.",
            ],
          },
          {
            id: "filtre",
            title: "Afgræns registreringer og Produkter",
            steps: [
              "Vælg Tilføj filter, hvis datasættet har filtre. Vælg Felt og Operator, enten Er lig med eller Er ikke lig med, og angiv Værdier adskilt med komma.",
              "Brug kildens præcise værdier. For aktive Waste-registreringer vælger du Status, Er lig med og værdien active. Værdien voided betegner annullerede registreringer.",
              "Vælg hvert filterfelt højst én gang. Flere filtre skal alle være opfyldt; flere værdier i samme filter er alternativer. Hvert filter kan have højst 50 værdier på hver højst 200 tegn.",
            ],
            paragraphs: [
              "Når Dimension er Produkt, vises Produktvalg. Vælg Alle, Kun valgte eller Alle undtagen valgte. Søg efter Produkter, eller brug en kategorilinje til at vælge alle Produkter i kategorien. Et afgrænset produktvalg skal indeholde mindst ét og højst 500 Produkter. Ved Forhold gælder produktvalget både tæller og nævner.",
            ],
          },
          {
            id: "gruppering",
            title: "Saml datapunkterne i grupper og perioder",
            steps: [
              "Vælg Dimension, hvis målingen skal opdeles efter eksempelvis Lokation, Produkt eller kategori. Behold Ingen dimension for at følge dashboardets lokationsvalg uden en ekstra opdeling.",
              "Vælg Tidsopdeling som Dag, Uge eller Måned. Det bestemmer afstanden mellem datapunkterne i et diagram.",
              "Angiv Grænse som et helt tal fra 1 til 50. Ved en dimension vises de største grupper, og resten samles under Andre. For et Forhold bestemmer tælleren, hvilke grupper der er størst.",
            ],
            paragraphs: [
              "Et Forhold kan kun bruge dimensioner, som findes i begge datasæt. Din rolles datavisning kan samle eller anonymisere lokationer og skjule medarbejderdimensionen.",
            ],
          },
          {
            id: "eksempel",
            title: "Eksempel: omsætning pr. planlagt time",
            steps: [
              "Giv målingen navnet Omsætning pr. planlagt time, og vælg Forhold.",
              "Vælg Dagligt salg og Omsætning under Tæller. Vælg Vagter og Timer under Nævner.",
              "Vælg Lokation som Dimension og Dag som Tidsopdeling. Kontrollér, at salgsdata og Workfeed-vagter dækker de samme lokationer og datoer.",
              "Kontrollér Forhåndsvisning. Eksempelvis giver 12.000 kr. i omsætning og 40 planlagte timer 300 kr. pr. time. Timer beregnes fra vagternes start til slut.",
            ],
            paragraphs: [
              "Når nævneren er 0, udelades datapunktet fra diagrammet. Er nævneren 0 for hele perioden, vises 0 som samlet værdi. Kontrollér derfor datagrundlaget, hvis et Forhold er tomt eller viser 0.",
            ],
            screenshot: {
              src: "/help/screenshots/datapunkter.png",
              alt: "Tilpasset måling med omsætning som tæller, planlagte timer som nævner og gruppering efter Lokation og dag",
              caption:
                "Opsætningen til Omsætning pr. planlagt time. Vælg datasæt og mål for både tæller og nævner, og angiv derefter datagrupperingen.",
              width: 1280,
              height: 1400,
            },
          },
          {
            id: "gem",
            title: "Gem målingen, og tilføj widgetten",
            steps: [
              "Vent på, at Forhåndsvisning er opdateret. Den opdateres automatisk efter ændringer. Sammenhold resultatet med registreringer eller rapporter for den valgte periode.",
              "Vælg Gem og fortsæt. Vælg derefter Visualisering og Størrelse, og afslut med Tilføj widget.",
              "Find senere målingen under Organisationens målinger i Tilføj widget for at genbruge den. Hver widget kan have sin egen visualisering og størrelse.",
            ],
            bullets: [
              "Liste og Tabel kræver en dimension. Donutdiagram kræver en Enkeltmåling med en dimension og kan ikke bruges til et Forhold.",
              "Du kan også oprette målingen under Administration → Målinger → Opret måling. Her afslutter du med Gem måling og tilføjer bagefter en widget fra dashboardet. Bibliotekets forhåndsvisning bruger de seneste 30 dage og de lokationer, du har adgang til.",
            ],
          },
          {
            id: "vedligehold",
            title: "Redigér og administrér fælles målinger",
            bullets: [
              "Brug blyanten ved målingen i Tilføj widget, på widgetten i redigeringstilstand eller under Administration → Målinger. Gem ændringer opdaterer alle widgets, der bruger målingen.",
              "Skal kun én widget have en anden beregning, skal du oprette en ny måling og bruge den i widgetten.",
              "Organisationen kan have højst 50 tilpassede målinger. Navne skal være unikke, også når forskellen kun er store og små bogstaver.",
              "En måling kan kun slettes, når ingen widgets bruger den. Biblioteket viser antallet af widgets. Fjern brugen først, og bekræft derefter Slet måling. Sletningen er permanent.",
            ],
          },
        ],
        troubleshooting: [
          {
            question: "Hvorfor kan jeg ikke oprette eller se målingen?",
            answer:
              "Oprettelse og ændringer kræver Administrere dashboards. Salgsdatasæt kræver også adgang til de relevante salgstal. Dagligt salg bruger aggregerede salgstal; salgsordrer, salgslinjer og Wolt bruger detaljerede salgstal. Rettigheden Se salgstal giver også adgang. Målinger med salgsdata markeres Følsom. Rollen og dens datavisning kan begrænse, hvilke målinger der er synlige.",
          },
          {
            question: "Forhåndsvisningen mangler data",
            answer:
              "Kontrollér periode, Lokation, filtre, produktvalg og integrationer. Filterværdier skal matche kilden præcist. Hvis datamængden er for stor, så vælg en kortere periode eller færre lokationer. En afkortet produktliste indeholder ikke nødvendigvis alle Produkter.",
          },
          {
            question: "Hvorfor kan ændringen ikke gemmes?",
            answer:
              "Kontrollér felter, navn og grænse. Hvis en ændret type eller dimension ikke passer til eksisterende widgets, skal deres visualisering ændres først. Er målingen ændret i en anden fane, skal du åbne den igen og tage udgangspunkt i den seneste version.",
          },
        ],
        relatedLinks: [
          {
            href: "/help/dashboard/widgets",
            label: "Opret og brug widgets",
          },
          {
            href: "/administration/metrics",
            label: "Åbn organisationens målinger",
          },
          {
            href: "/help/integrationer/overblik",
            label: "Kontrollér integrationer og datakilder",
          },
        ],
      },
      {
        slug: "deling",
        label: "Del et dashboard",
        summary:
          "Opret et læselink med udløb, beskyt det med en adgangskode, og tilbagekald det senere.",
        appHref: "/dashboard",
        appLinkLabel: "Åbn Dashboard",
        sections: [
          {
            id: "opret",
            title: "Opret delingslinket",
            steps: [
              "Åbn dashboardet, og kontrollér widgets og data. Skal linket bruge et bestemt lokationsvalg og en bestemt periode, så vælg dem og brug Redigér → Gem som standard først.",
              "Vælg Del, og giv linket et navn, så du kan kende det igen.",
              "Vælg udløb efter 1, 7, 30 eller 90 dage. Angiv en adgangskode på mindst fire tegn. Den er påkrævet ved følsomme målinger som omsætning.",
              "Vælg Opret og kopiér link. Åbn linket, og kontrollér visningen, før du giver det videre.",
            ],
          },
          {
            id: "indhold",
            title: "Det viser linket",
            bullets: [
              "Linket fastholder dashboardets layout, lokationsvalg og periode fra oprettelsen. Data opdateres fortsat.",
              "Modtageren får en læsevisning. Opret et nyt link, hvis en anden opsætning skal deles.",
              "Dashboardets rollevalg og et delingslink er forskellige former for adgang. Gennemgå indholdet i selve linket før deling.",
            ],
          },
          {
            id: "tilbagekald",
            title: "Find eller luk et link",
            steps: [
              "Åbn Del igen. Aktive og tidligere links står nederst med deres udløbstid.",
              "Brug kopiér-knappen for at kopiere et aktivt link igen.",
              "Tilbagekald et link, der ikke længere skal bruges, og bekræft handlingen. Linket holder straks op med at virke og kan ikke genaktiveres.",
            ],
          },
        ],
        troubleshooting: [
          {
            question: "Hvorfor virker linket ikke længere?",
            answer:
              "Kontrollér i Del, om linket er udløbet eller tilbagekaldt. Opret et nyt link, hvis der fortsat skal være adgang.",
          },
          {
            question: "Linket kunne ikke kopieres",
            answer: "Markér linket i dialogen, og kopiér det manuelt.",
          },
        ],
        relatedLinks: [
          {
            href: "/help/dashboard/widgets",
            label: "Widgets og dagligt overblik",
          },
        ],
      },
    ],
  },
  {
    slug: "medarbejdere",
    label: "Medarbejdere",
    summary:
      "Se vagtplan og medarbejdere fra Workfeed på den rigtige Lokation.",
    icon: UsersRoundIcon,
    guides: [
      {
        slug: "overblik",
        label: "Overblik",
        summary:
          "Se vagtplan og medarbejdere fra Workfeed på den rigtige Lokation.",
        appHref: "/employees",
        appLinkLabel: "Åbn Medarbejdere",
        sections: [
          {
            id: "om",
            title: "Sådan fungerer Medarbejdere",
            paragraphs: [
              "Medarbejdere viser offentliggjorte vagter og medarbejderdata fra Workfeed. Ret data og vagter i Workfeed; den tilsluttede Lokation viser dem efter synkronisering.",
            ],
          },
          {
            id: "forloeb",
            title: "Fra opsætning til daglig brug",
            steps: [
              "Klargør Workfeed-forbindelsen, og vælg vagtplanens tidszone og adgang.",
              "Vælg Lokation og uge, find medarbejdere, og kontrollér synkroniseringen, hvis noget mangler.",
            ],
          },
          {
            id: "foer-du-starter",
            title: "Før du starter",
            bullets: [
              "Workfeed skal være forbundet, og hver Lokation skal være koblet til den rigtige Workfeed-afdeling.",
              "Rollen skal give adgang til vagtplanen, medarbejderkartoteket eller begge.",
            ],
          },
        ],
      },
      {
        slug: "vagtplan",
        label: "Sæt op og brug vagtplanen",
        summary:
          "Vælg tidszone og adgang, og find offentliggjorte vagter og medarbejdere fra Workfeed.",
        appHref: "/employees",
        appLinkLabel: "Åbn Medarbejdere",
        sections: [
          {
            id: "opsaetning",
            title: "Klargør vagtplanen",
            steps: [
              "Forbind Workfeed under Administration → Integrationer, og kobl hver Lokation til den afdeling, der har dens vagtplan. Følg Workfeed-guiden for CompanyID, API-nøgle og forbindelsen.",
              "Åbn Administration → Vagtplan. Vælg Tidszone for vagtplanens uger, datoer og klokkeslæt, og gem.",
              "Giv de relevante roller Se vagtplan, Se medarbejderkartotek eller begge under Administration → Brugere → Roller og adgang. Kontrollér også Brugernes lokationsadgang.",
            ],
            screenshot: {
              src: "/help/screenshots/medarbejdere.webp",
              alt: "Vagtplanens tidszoneindstilling",
              caption:
                "Denne tidszone styrer uger, datoer og klokkeslæt i vagtplanen.",
              width: 711,
              height: 215,
            },
          },
          {
            id: "vagtplan",
            title: "Se vagter for en uge",
            steps: [
              "Vælg Lokation og fanen Vagtplan.",
              "Brug pilene til forrige og næste uge, vælg en dato, eller tryk Denne uge.",
              "Læs medarbejdernes vagter på de enkelte dage. På en mindre skærm kan du vælge den dag, du vil se.",
              "Ret eller offentliggør vagter i Workfeed. Appen viser de synkroniserede data.",
              "Efter opsætning skal du sammenligne en uge med kendte vagter med Workfeed. Kontrollér medarbejdernavne og tidspunkter.",
            ],
          },
          {
            id: "register",
            title: "Find en medarbejder",
            bullets: [
              "Åbn fanen Medarbejdere, og søg efter navnet.",
              "Vælg Aktive eller Alle. Listen viser medarbejderens lokationer og status som Aktiv eller Inaktiv.",
              "Brug Vis flere, hvis medarbejderen ikke er på den første side.",
              "Kontrollér ved første opsætning, at en medarbejder fra den tilknyttede Workfeed-afdeling findes på lokationen.",
            ],
          },
          {
            id: "opdatering",
            title: "Kontrollér synkroniseringen",
            bullets: [
              "Ved fejl eller afbrudt Workfeed-forbindelse vises de senest hentede data fortsat. En synlig vagtplan er derfor ikke altid opdateret.",
              "Start en synkronisering, hvis knappen er tilgængelig for din rolle. Vent, hvis en synkronisering allerede kører, eller systemet beder dig prøve igen om få minutter.",
              "Advarslen Visningen er afgrænset betyder, at alle ugens medarbejdere eller vagter ikke kunne vises. Kontrollér resten i Workfeed.",
            ],
          },
        ],
        troubleshooting: [
          {
            question: "Hvorfor mangler medarbejderen eller vagten?",
            answer:
              "Kontrollér Lokation, uge og filteret Aktive. Kontrollér derefter, at vagten er offentliggjort i Workfeed, og at Workfeed-afdelingen er koblet til den rigtige Lokation.",
          },
          {
            question: "Vagterne vises på et forkert tidspunkt",
            answer:
              "Kontrollér tidszonen under Administration → Vagtplan. Den styrer datoer og klokkeslæt i visningen.",
          },
        ],
        relatedLinks: [
          {
            href: "/help/integrationer/workfeed",
            label: "Workfeed-forbindelse og synkronisering",
          },
          {
            href: "/help/staff-food/registrering",
            label: "Registrér Staff food",
          },
        ],
      },
    ],
  },
  {
    slug: "transfer",
    label: "Transfer",
    summary:
      "Send Produkter mellem lokationer, og følg leveringen frem til modtagelse.",
    icon: ArrowRightLeftIcon,
    guides: [
      {
        slug: "overblik",
        label: "Overblik",
        summary:
          "Send Produkter mellem lokationer, og følg leveringen frem til modtagelse.",
        appHref: "/transfers",
        appLinkLabel: "Opret Transfer",
        sections: [
          {
            id: "om",
            title: "Sådan fungerer Transfer",
            paragraphs: [
              "En transfer beskriver de Produkter og mængder, én Lokation sender til en anden. Afsenderen opretter transferen. Modtageren afslutter leveringen under Varemodtagelse med de faktiske mængder.",
            ],
          },
          {
            id: "forloeb",
            title: "Fra opsætning til daglig brug",
            steps: [
              "Klargør enheder og temperaturkrav, og opret transferen.",
              "Følg status i Transferhistorik. Efter modtagelse kan du sammenholde sendt og modtaget og eksportere til CSV.",
            ],
          },
          {
            id: "foer-du-starter",
            title: "Før du starter",
            bullets: [
              "Begge lokationer og de relevante Produkter skal være oprettet.",
              "Afsender og modtager skal have adgang til deres Lokation og til henholdsvis Transfer og Varemodtagelse.",
            ],
          },
        ],
      },
      {
        slug: "opret",
        label: "Klargør og opret en transfer",
        summary:
          "Kontrollér enheder og temperaturkrav, og registrér det, der sendes mellem lokationerne.",
        appHref: "/transfers",
        appLinkLabel: "Opret Transfer",
        sections: [
          {
            id: "opsaetning",
            title: "Klargør Produkter og adgang",
            steps: [
              "Kontrollér, at både afsender- og modtagerlokationen findes under Administration → Lokationer.",
              "Åbn Administration → Produkter. Kontrollér standardenhed og omregninger for de Produkter, der skal sendes. Angiv eksempelvis, hvor mange stykker en kasse indeholder.",
              "Angiv Maksimal temperatur på Produkter, der kræver temperaturregistrering.",
              "Giv afsenderen adgang til at oprette transfers og modtageren adgang til at registrere varemodtagelser under Administration → Brugere → Roller og adgang. Kontrollér begge Brugeres lokationsadgang.",
            ],
            screenshot: {
              src: "/help/screenshots/product-temperature.webp",
              alt: "Produktdetaljer med feltet Maksimal temperatur",
              caption:
                "Temperaturkravet kommer fra Produktets Maksimal temperatur i Administration.",
              width: 511,
              height: 340,
            },
          },
          {
            id: "registrering",
            title: "Udfyld transferen",
            steps: [
              "Vælg Fra lokation og Til lokation. De skal være forskellige. Vælg den ansvarlige Bruger og det rigtige tidspunkt for transferen.",
              "Søg efter et Produkt, og tilføj det. Vælg enhed, og angiv den sendte mængde. Mængden skal være større end nul.",
              "Tilføj en ekstra enhed på samme Produkt, hvis du eksempelvis sender både hele kasser og løse stykker. Kontrollér hver transferlinje særskilt.",
              "Udfyld temperaturer, tilføj en relevant kommentar, og gem. Find bagefter transferen i Transferhistorik.",
            ],
          },
          {
            id: "temperatur",
            title: "Registrér temperaturafvigelser",
            bullets: [
              "En temperatur er påkrævet, når Produktet har en Maksimal temperatur. Temperaturen gælder Produktet, også når det har flere transferlinjer.",
              "Angiv temperaturen med højst én decimal. Feltet accepterer værdier mellem -100 og 100 °C.",
              "Overstiger målingen Produktets maksimum, skal du tilføje en kommentar og bekræfte afvigelsen, før transferen gemmes.",
            ],
          },
          {
            id: "modtagelse",
            title: "Modtageren afslutter leveringen",
            paragraphs: [
              "Find transferen i Transferhistorik, og kontrollér afsender, modtager, enheder, mængder og temperaturer. Transferen skal også vises under Varemodtagelse på modtagerlokationen.",
              "Modtageren registrerer de faktiske mængder for at afslutte leveringen. Derefter viser Transferhistorik både sendt og modtaget.",
            ],
          },
        ],
        troubleshooting: [
          {
            question: "Produktet eller enheden mangler",
            answer:
              "Kontrollér Produktet og dets enheder under Administration → Produkter. En enhed, der allerede er brugt på Produktet i transferen, kan ikke vælges på endnu en linje.",
          },
        ],
        relatedLinks: [
          {
            href: "/help/transfer/historik",
            label: "Transferhistorik og eksport",
          },
          {
            href: "/help/varemodtagelse/transfer",
            label: "Modtag en transfer",
          },
        ],
      },
      {
        slug: "historik",
        label: "Transferhistorik og eksport",
        summary:
          "Find en transfer, kontrollér modtagelsen, og eksportér de nødvendige kolonner.",
        appHref: "/transfers/history",
        appLinkLabel: "Åbn Transferhistorik",
        sections: [
          {
            id: "find",
            title: "Find og kontrollér transferen",
            steps: [
              "Vælg Fra dato og Til dato i Transferhistorik.",
              "Åbn transferen, og kontrollér afsender, modtager, ansvarlig og kommentar.",
              "Se temperatur og temperaturgrænse pr. Produkt. En temperaturafvigelse markeres særskilt.",
              "Kontrollér varemodtagelsens status. Når den er Registreret, vises både sendt og modtaget mængde.",
            ],
          },
          {
            id: "ret",
            title: "Ret en transfer før modtagelse",
            bullets: [
              "Vælg Redigér transfer i detaljerne, hvis du har adgang til at ændre den.",
              "Slet transfer kræver bekræftelse og sletter transferen og dens produktlinjer permanent.",
              "Efter registreret varemodtagelse kan transferen hverken redigeres eller slettes. Lageret er da opdateret med de modtagne mængder.",
            ],
          },
          {
            id: "csv",
            title: "Eksportér til CSV",
            steps: [
              "Afgræns perioden, og vælg Eksportér til CSV.",
              "Vælg kolonner og rækkefølge. Flyt uønskede kolonner til Ikke med i eksporten.",
              "Vælg om mængderne skal omregnes til standardenheden. Behold enhedskolonnen, så mængderne kan læses korrekt.",
              "Eksportér, og kontrollér datoer, enheder og temperaturkolonner i filen.",
            ],
          },
        ],
        troubleshooting: [
          {
            question: "Hvorfor kan jeg ikke rette transferen?",
            answer:
              "En registreret varemodtagelse låser transferen. Hvis den stadig afventer, skal din rolle også have adgang til at ændre transfers.",
          },
        ],
        relatedLinks: [
          {
            href: "/help/varemodtagelse/transfer",
            label: "Modtag en transfer",
          },
        ],
      },
    ],
  },
  {
    slug: "varemodtagelse",
    label: "Varemodtagelse",
    summary:
      "Kontrollér leverede Produkter, og registrér de mængder, der skal på lager.",
    icon: PackageCheckIcon,
    guides: [
      {
        slug: "overblik",
        label: "Overblik",
        summary:
          "Kontrollér leverede Produkter, og registrér de mængder, der skal på lager.",
        appHref: "/goods-receipts",
        appLinkLabel: "Åbn Varemodtagelse",
        sections: [
          {
            id: "om",
            title: "Sådan fungerer Varemodtagelse",
            paragraphs: [
              "Varemodtagelse lægger leverede mængder på lager. Åbn en afventende transfer, når leveringen kommer fra en anden Lokation, eller brug Manuel varemodtagelse til en levering uden transfer.",
            ],
          },
          {
            id: "forloeb",
            title: "Fra opsætning til daglig brug",
            steps: [
              "Kontrollér den fysiske levering, og angiv mængderne i de viste enheder.",
              "Gennemgå afvigelser og dokumentation før bekræftelse. Kontrollér derefter Lager. En registreret varemodtagelse kan ikke redigeres.",
            ],
          },
          {
            id: "foer-du-starter",
            title: "Før du starter",
            bullets: [
              "Rollen skal tillade varemodtagelse, og Brugeren skal have adgang til modtagerlokationen.",
              "Produkter, enheder og omregninger skal være oprettet. En leverandørpakning skal kunne omregnes til Produktets enhed.",
            ],
          },
        ],
      },
      {
        slug: "transfer",
        label: "Sæt op og modtag transfers",
        summary:
          "Vælg brug af følgesedler, og registrér de faktisk leverede mængder på modtagerlokationen.",
        appHref: "/goods-receipts",
        appLinkLabel: "Åbn Varemodtagelse",
        sections: [
          {
            id: "foelgeseddel",
            title: "Vælg, om følgesedlen skal kunne vedhæftes",
            steps: [
              "Åbn Administration → Varemodtagelse → Følgesedler.",
              "Slå Transfer til, hvis modtagelser fra transfers skal have et valgfrit billedfelt til følgesedlen. Gem indstillingerne.",
            ],
            screenshot: {
              src: "/help/screenshots/varemodtagelse.webp",
              alt: "Indstillingen for billede af følgeseddel ved Transfer",
              caption:
                "Transfer-indstillingen gælder kun modtagelse af transfers. Manuel varemodtagelse har altid billedfeltet.",
              width: 711,
              height: 201,
            },
          },
          {
            id: "kontroller",
            title: "Kontrollér leveringen",
            steps: [
              "Vælg modtagerlokationen under Varemodtagelse, og åbn den afventende transfer.",
              "Kontrollér afsender, tidspunkt og Produkter. Sammenhold hver linje med det, der fysisk er leveret.",
              "Angiv den modtagne mængde i den valgte enhed. Brug Alt modtaget, hvis den sendte mængde passer, eller angiv 0 for en manglende linje.",
              "Tilføj ekstra Produkter, hvis leveringen indeholder noget ud over transferen. Kontrollér Overblik for manglende linjer og afvigelser.",
              "Tilføj eventuelt en kommentar og et billede af følgesedlen, hvis billedfeltet er aktiveret.",
            ],
          },
          {
            id: "registrer",
            title: "Bekræft de faktiske mængder",
            steps: [
              "Vælg Registrér varemodtagelse. Læs bekræftelsen og antallet af afvigende produktlinjer.",
              "Gå tilbage med Fortsæt kontrollen, hvis noget skal rettes. Bekræft først, når mængder og enheder er korrekte.",
              "Kontrollér, at transferen forsvinder fra de afventende modtagelser. De modtagne mængder kan nu ses i Transferhistorik og Lager.",
            ],
            paragraphs: [
              "Kun de angivne mængder flyttes. Registreringen kan ikke redigeres bagefter, og den tilhørende transfer låses for redigering og sletning.",
            ],
          },
        ],
        troubleshooting: [
          {
            question: "Hvorfor mangler transferen på listen?",
            answer:
              "Kontrollér modtagerlokation og din adgang. Transferen kan allerede være modtaget. Vises kun de første 100 transfers, kommer de øvrige frem, når de ældste modtagelser er registreret.",
          },
          {
            question: "Mængden kan ikke gemmes",
            answer:
              "Alle oprindelige linjer skal have en gyldig mængde, også 0 for manglende Produkter. Følg feltets maksimum, og kontrollér enheden. Ekstra produktlinjer skal have en mængde større end nul.",
          },
        ],
        relatedLinks: [
          {
            href: "/help/transfer/historik",
            label: "Se sendt og modtaget i Transferhistorik",
          },
          {
            href: "/help/waste/daarlig-levering",
            label: "Dokumentér en dårlig levering",
          },
        ],
      },
      {
        slug: "manuel",
        label: "Registrér en manuel levering",
        summary:
          "Læg en levering på lager, når der ikke er en transfer at modtage.",
        appHref: "/goods-receipts/manual",
        appLinkLabel: "Åbn Manuel varemodtagelse",
        sections: [
          {
            id: "registrer",
            title: "Opret varemodtagelsen",
            steps: [
              "Vælg den rigtige Lokation i Varemodtagelse, og åbn Manuel varemodtagelse.",
              "Kontrollér Lokation i Modtagelsesinfo. Angiv dato og klokkeslæt i Modtaget.",
              "Søg efter og tilføj de leverede Produkter. Vælg enhed, og angiv den modtagne mængde større end nul.",
              "Tilføj eventuelt et billede af følgesedlen og en kommentar på højst 500 tegn.",
              "Vælg Registrér varemodtagelse. Gennemgå bekræftelsen, og registrér først, når mængderne passer.",
            ],
          },
          {
            id: "kontrol",
            title: "Kontrollér før og efter",
            bullets: [
              "Brug Produktets enhed, ikke blot tallet på leverandørens pakning. Kontrollér omregningen, hvis du eksempelvis modtager kasser og lageret bruger stykker.",
              "Der kan højst tilføjes 200 produktlinjer. Brug flere modtagelser ved større leveringer, og undgå at registrere den samme linje to gange.",
              "En registreret manuel varemodtagelse lægger de angivne mængder på lager og kan ikke redigeres bagefter.",
              "Åbn Lager på samme Lokation, og kontrollér de modtagne Produkter.",
            ],
          },
        ],
        troubleshooting: [
          {
            question: "Følgesedlen kan ikke uploades",
            answer:
              "Vælg et JPEG-, PNG-, WebP- eller AVIF-billede. Et billede er valgfrit ved manuel varemodtagelse. Kontrollér, at registreringen blev gemt, før du forsøger igen.",
          },
        ],
        relatedLinks: [
          {
            href: "/help/count/lager-og-rapport",
            label: "Kontrollér Lager",
          },
          {
            href: "/help/waste/daarlig-levering",
            label: "Dokumentér en dårlig levering",
          },
        ],
      },
    ],
  },
  {
    slug: "count",
    label: "Count",
    summary:
      "Planlæg optællingen, afstem lageret, og undersøg afvigelser mellem Count-registreringer.",
    icon: ClipboardListIcon,
    guides: [
      {
        slug: "overblik",
        label: "Overblik",
        summary:
          "Planlæg optællingen, afstem lageret, og undersøg afvigelser mellem Count-registreringer.",
        appHref: "/count",
        appLinkLabel: "Åbn Count",
        sections: [
          {
            id: "om",
            title: "Sådan fungerer Count",
            paragraphs: [
              "Count afstemmer den registrerede lagerbeholdning med det, der fysisk er på lokationen. Produkter kan opdeles i områder, så optællingen følger arbejdet på stedet.",
            ],
          },
          {
            id: "forloeb",
            title: "Fra opsætning til daglig brug",
            steps: [
              "Vælg Produkter, områder og Count-vindue, og udfør optællingen.",
              "Bekræft Count for at afstemme lageret. Kontrollér bagefter Lager og brug Waste-rapporten til at undersøge afvigelser siden forrige Count.",
            ],
          },
          {
            id: "foer-du-starter",
            title: "Før du starter",
            bullets: [
              "Produkter skal have korrekte standardenheder og omregninger.",
              "Lokationens åbningstider og særlige datoer skal være ajour, fordi de bruges af Count-vinduet.",
              "Kontrollér mængder og enheder før bekræftelse. En registreret Count kan ikke rettes.",
            ],
          },
        ],
      },
      {
        slug: "udfoer",
        label: "Planlæg og udfør Count",
        summary:
          "Vælg Produkter, områder og Count-vindue, og afslut optællingen med en lagerafstemning.",
        appHref: "/count",
        appLinkLabel: "Åbn Count",
        sections: [
          {
            id: "produkter-og-omraader",
            title: "Klargør lokationen til optælling",
            steps: [
              "Kontrollér Produkternes standardenheder og omregninger. Angiv lokationens åbningstider og særlige datoer under Administration → Lokationer.",
              "Åbn lokationens Produkter og Områder. Vælg alle aktive Produkter eller en afgrænset liste. Produktvalget bruges også af Waste.",
              "Opret eventuelle Count-områder, og vælg deres Produkter og rækkefølge, så optællingen følger den fysiske rute.",
            ],
          },
          {
            id: "count-vindue",
            title: "Planlæg Count-vinduet",
            steps: [
              "Åbn Administration → Count, og vælg Count-frekvens. Ved månedlig Count vælger du Count-dag. Ved interval vælger du Interval i dage og Første Count-dato.",
              "Vælg, om Count må registreres uden for Count-vinduet, om Count skal afsluttes før åbning, og om andre funktioner skal låses. Gem Count-indstillinger.",
              "Åbn Count på den relevante Lokation, og kontrollér dato, vindue, områder og produktliste.",
            ],
            bullets: [
              "Count-vinduet åbner ved lukketid på Count-dagen. Kræv Count før åbning holder det åbent, indtil Count er registreret. Ellers lukker det, når lokationen åbner igen.",
              "Låsning henviser andre driftsfunktioner til Count, når vinduet åbner. Waste-registrering er stadig tilgængelig. I almindelig tilstand kan du også åbne Lager, Profil og Administration. Låsen ophæves, når Count er registreret.",
            ],
            screenshot: {
              src: "/help/screenshots/count.webp",
              alt: "Count-indstillinger med frekvens, dag og regler for Count-vinduet",
              caption:
                "Count-vinduet bruger både disse regler og lokationens åbningstider.",
              width: 711,
              height: 570,
            },
          },
          {
            id: "tael",
            title: "Tæl den aktuelle Lokation",
            steps: [
              "Vælg Lokation, og kontrollér Count-perioden. Registrering følger organisationens regler for Count-vinduet.",
              "Vælg et område, hvis lokationen bruger områder. Se fremdrift og om andre arbejder i området, før du starter.",
              "Vælg Ét Produkt ad gangen til en fast rute eller Alle Produkter til søgning og kategorier.",
              "Registrér den optalte mængde i den rigtige enhed. Brug Produktets enheder, hvis du tæller både hele pakninger og løse mængder, og undgå at tælle det samme lager to gange.",
              "I Ét Produkt ad gangen vælger du Færdig efter sidste Produkt for at afslutte området. Vælg et andet Område, og fortsæt, til den planlagte Count er færdig.",
            ],
          },
          {
            id: "afslut",
            title: "Registrér lagerafstemningen",
            steps: [
              "Gennemgå mængder og enheder. Der skal være indtastet mindst én positiv mængde, før Count kan registreres.",
              "Vælg Registrér Count, og skriv en begrundelse for lagerafstemningen.",
              "Læs bekræftelsen. Lageret overskrives for Produkter med en angivet mængde. Et tomt felt bevarer lageret; 0 angiver, at der ikke er noget på lager.",
              "Bekræft, og kontrollér beskeden Count er registreret. Count kan ikke rettes bagefter.",
            ],
          },
          {
            id: "raekkefoelge",
            title: "Tilpas rækkefølgen",
            paragraphs: [
              "Med adgang til at administrere lokationer kan du vælge Redigér rækkefølge. Placér Produkterne, så de følger den fysiske rute. Et tomt område skal have valgt Produkter, før det kan bruges til optælling.",
            ],
          },
        ],
        troubleshooting: [
          {
            question: "Count-vinduet er lukket",
            answer:
              "Se nedtællingen til næste åbning. Kontrollér lokationens åbningstider og Count-indstillinger, hvis tidspunktet er forkert.",
          },
          {
            question: "Et Produkt mangler i området",
            answer:
              "Ryd søgningen, kontrollér kategorien, og kontrollér områdets produktvalg og rækkefølge under Administration → Lokationer → Produkter og Områder.",
          },
        ],
        relatedLinks: [
          {
            href: "/help/count/lager-og-rapport",
            label: "Lager og Waste-rapport efter Count",
          },
        ],
      },
      {
        slug: "lager-og-rapport",
        label: "Kontrollér lager og afvigelser",
        summary:
          "Kontrollér lagerbeholdningen og undersøg afvigelser mellem to Count-registreringer.",
        appHref: "/count/stock",
        appLinkLabel: "Åbn Lager",
        sections: [
          {
            id: "lager",
            title: "Kontrollér Lager",
            steps: [
              "Åbn Count → Lager, og vælg Lokation.",
              "Vælg Kort for et visuelt overblik eller Detaljer for tabellen.",
              "Kontrollér mængden og den viste enhed. Sammenhold lageret med den registrerede Count og efterfølgende varemodtagelser og forbrug.",
            ],
          },
          {
            id: "salgskilde",
            title: "Vælg salgskilde til rapporten",
            steps: [
              "Åbn Administration → Count → Salgskilde til Count, og vælg OnlinePOS eller Wolt for hver Lokation.",
              "Vælg den kilde, der dækker lokationens salg. Kontrollér data og produktkoblinger for den periode, rapporten skal dække.",
            ],
          },
          {
            id: "eksport",
            title: "Eksportér afvigelser efter Count",
            steps: [
              "Åbn den registrerede Count, og vælg Eksportér Waste. Det kræver eksportadgang og en tidligere registreret Count som udgangspunkt.",
              "Læs eventuelle advarsler om salgskilder, synkronisering og produktkoblinger.",
              "Åbn CSV-filen. Sammenhold forventet beholdning før salg, salg, optalt beholdning og Waste i Produktets standardenhed.",
            ],
          },
          {
            id: "afgraensning",
            title: "Forstå rapportens grundlag",
            bullets: [
              "Rapporten viser lagerafvigelser beregnet ved Count. Waste → Rapport viser de løbende Waste-registreringer.",
              "Udeladt salg eller manglende produktkoblinger påvirker den beregnede afvigelse. Kontrollér kilden, før rapporten bruges til opfølgning.",
              "Hvis der ikke er lagerafvigelser, vises en besked, og der dannes ingen CSV-fil.",
            ],
          },
        ],
        troubleshooting: [
          {
            question:
              "Hvorfor kan den første Count ikke give en Waste-rapport?",
            answer:
              "Rapporten skal have en tidligere registreret Count som udgangspunkt. Den første Count etablerer dette udgangspunkt.",
          },
        ],
        relatedLinks: [
          {
            href: "/help/waste/rapport",
            label: "Løbende Waste-registreringer",
          },
          {
            href: "/help/integrationer",
            label: "Kontrollér salgskilder",
          },
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
          "Registrér kasserede Produkter og dårlige leveringer, og følg op i rapporten.",
        appHref: "/waste",
        appLinkLabel: "Registrér Waste",
        sections: [
          {
            id: "om",
            title: "Sådan fungerer Waste",
            paragraphs: [
              "Waste registrerer kasserede Produkter og fører mængden fra lageret. Dårlig levering samler billeder og produktlinjer for en afvist levering, med det lagerfradrag organisationen har valgt.",
            ],
          },
          {
            id: "forloeb",
            title: "Fra opsætning til daglig brug",
            steps: [
              "Vælg Produkter og genveje, og registrér den løbende Waste.",
              "Sæt dokumentation og meddelelser op for dårlige leveringer. Brug Waste-rapporten til at finde registreringer, eksportere og annullere fejl.",
            ],
          },
          {
            id: "foer-du-starter",
            title: "Før du starter",
            bullets: [
              "Produkter og enheder skal være oprettet. Lokationens produktvalg deles med Count.",
              "Aftal lagerfradrag for dårlige leveringer, så samme mængde ikke trækkes fra to gange.",
            ],
          },
        ],
      },
      {
        slug: "registrering",
        label: "Sæt op og registrér Waste",
        summary:
          "Vælg Produkter og genveje til lokationen, registrér kasserede mængder, og fortryd fejl.",
        appHref: "/waste",
        appLinkLabel: "Registrér Waste",
        sections: [
          {
            id: "opsaetning",
            title: "Vælg Produkter og fælles indstillinger",
            steps: [
              "Opret Produkter og enheder i produktkataloget. Vælg derefter alle aktive Produkter eller en afgrænset liste under Administration → Lokationer → Produkter og Områder. Listen bruges også af Count.",
              "Åbn Administration → Waste. Indstil Nulstil efter inaktivitet for fælles tablets. Nulstillingen rydder søgning og dialoger og vender tilbage til Registrér med Alle produkter.",
              "Vælg Popularitetsperiode og Brug historik fra hele organisationen. Slå organisationshistorik fra, hvis de anbefalede genveje skal følge den enkelte Lokations Waste. Gem Waste-indstillingerne.",
            ],
            screenshot: {
              src: "/help/screenshots/waste.webp",
              alt: "Waste-indstillinger med nulstilling og valg af historik til mængdegenveje",
              caption:
                "Historik og popularitetsperiode styrer de anbefalede genveje. Faste genveje vælges på Produktet.",
              width: 711,
              height: 251,
            },
          },
          {
            id: "genveje",
            title: "Tilpas genveje til lokationen",
            bullets: [
              "Med adgang til Waste-indstillinger kan du fastgøre Produkter og vælge Redigér genveje i produktdialogen.",
              "Gem én eller to genveje med hver sin mængde og enhed.",
              "Brug anbefalede mængder fjerner dine valgte genveje og bruger igen produktets Waste-historik.",
            ],
          },
          {
            id: "registrer",
            title: "Registrér den kasserede mængde",
            steps: [
              "Kontrollér Lokation, produktvalg og enheder, og vælg fanen Registrér.",
              "Find Produktet via søgning eller kategori. Alle viser det samlede produktvalg.",
              "Tryk på en mængdegenvej for at registrere den viste mængde med det samme. Kontrollér både tal og enhed før trykket.",
              "Åbn Produktet, hvis du skal bruge en anden mængde. Angiv en mængde større end nul, vælg enhed, og tryk Registrér Waste.",
            ],
          },
          {
            id: "fortryd",
            title: "Fortryd en fejl",
            bullets: [
              "Brug Fortryd i beskeden eller knappen nederst, mens registreringen stadig kan fortrydes.",
              "Har du flere nye registreringer, kan du åbne listen og vælge dem, der skal fortrydes.",
              "Efter fortrydelsesfristen skal en Bruger med den nødvendige adgang annullere registreringen i Waste-rapporten med en begrundelse.",
            ],
          },
        ],
        troubleshooting: [
          {
            question: "Hvorfor mangler et Produkt?",
            answer:
              "Ryd søgningen, og vælg Alle. Kontrollér derefter lokationens produktvalg under Administration → Lokationer → Produkter og Områder.",
          },
        ],
        relatedLinks: [
          {
            href: "/help/waste/rapport",
            label: "Waste-rapport og annullering",
          },
          {
            href: "/help/waste/daarlig-levering",
            label: "Registrér en dårlig levering",
          },
        ],
      },
      {
        slug: "daarlig-levering",
        label: "Sæt op og registrér dårlige leveringer",
        summary:
          "Vælg lagerfradrag og e-mailmodtagere, dokumentér leveringen, og følg meddelelsens status.",
        appHref: "/waste/bad-delivery",
        appLinkLabel: "Åbn Dårlig levering",
        sections: [
          {
            id: "opsaetning",
            title: "Vælg lagerfradrag og meddelelser",
            steps: [
              "Åbn Administration → Waste → Dårlige leveringer. Vælg Træk som standard fra lager og Vis valget ved registrering.",
              "Afklar, om afviste Produkter allerede indgår i lageret. Produkter, der aldrig er lagt på lager ved varemodtagelse, skal ikke også trækkes fra som en dårlig levering.",
              "Udfyld Til, E-mailens emne og E-mailens indhold, hvis registreringen skal sende en automatisk meddelelse. Skabelonen kan bruge {location}, {products} og {comment}. En tom Til-liste slår meddelelser fra.",
              "Gem indstillingerne for Dårlige leveringer. Waste og Dårlige leveringer har hver sin gemmeknap.",
            ],
          },
          {
            id: "dokumenter",
            title: "Dokumentér leveringen",
            steps: [
              "Åbn Waste → Dårlig levering, og kontrollér Lokation.",
              "Tag eller upload et billede af de dårlige Produkter og et læsbart billede af følgesedlen. Begge billeder er påkrævede.",
              "Tilføj de berørte Produkter med den rigtige enhed og mængde. Tilføj eventuelt en kommentar på højst 500 tegn.",
              "Kontrollér Træk produkterne fra lageret, hvis valget vises. Ellers gælder organisationens standard. Valget skal passe til, om Produkterne allerede indgår i lageret.",
              "Vælg Gennemse og registrér. Kontrollér Produkter, billeder og lagerændring, og vælg Bekræft registrering.",
            ],
          },
          {
            id: "meddelelse",
            title: "Kontrollér meddelelsen bagefter",
            bullets: [
              "Uden e-mailmodtagere gemmes registreringen stadig, og et valgt lagerfradrag gennemføres. Der sendes ingen automatisk meddelelse.",
              "Åbn registreringen under Waste → Rapport → Dårlige leveringer for at se billeder, modtagere og status for den oprindelige meddelelse.",
              "Hvis meddelelsen fejlede eller ikke var sat op, kan Send oprindelig meddelelse vises. Kontrollér indstillinger og fejl, før den sendes igen.",
            ],
          },
        ],
        troubleshooting: [
          {
            question: "Kan jeg rette en forkert registrering?",
            answer:
              "Åbn den i rapporten, og vælg Annullér registrering med en begrundelse. Et oprindeligt lagerfradrag føres tilbage. Billeder og ændringshistorik bevares. Registrér derefter den korrekte levering, hvis nødvendigt.",
          },
          {
            question: "E-mailen fejlede, skal jeg registrere igen?",
            answer:
              "Kontrollér først rapporten. En gemt registrering skal ikke oprettes igen for at gensende meddelelsen. Brug meddelelsens genforsøg, når årsagen er løst.",
          },
        ],
        relatedLinks: [
          {
            href: "/help/waste/rapport",
            label: "Waste-rapport og annullering",
          },
          {
            href: "/help/varemodtagelse",
            label: "Varemodtagelse",
          },
        ],
      },
      {
        slug: "rapport",
        label: "Waste-rapport og annullering",
        summary:
          "Se mængder og registreringer, eksportér rapporter, og annullér fejl med en begrundelse.",
        appHref: "/waste/report",
        appLinkLabel: "Åbn Waste-rapport",
        sections: [
          {
            id: "find",
            title: "Find registreringerne",
            steps: [
              "Vælg Fra, Til og Lokation. Vælg Alle lokationer, hvis du vil samle de lokationer, du har adgang til.",
              "Oversigt viser samlede mængder pr. Lokation, Produkt og enhed, når din rolle har eksportadgang.",
              "Registreringer viser tidspunkt, medarbejder, mængde, kilde og status. Åbn en række for detaljer, og brug Indlæs flere ved behov.",
            ],
          },
          {
            id: "annuller",
            title: "Annullér en registrering",
            steps: [
              "Åbn den aktive registrering, og kontrollér, at det er den rigtige.",
              "Vælg Annullér registrering, og skriv en begrundelse.",
              "Bekræft. Mængden føres tilbage på lageret, og ændringshistorikken bevares. Status bliver Annulleret.",
            ],
            paragraphs: [
              "OnlinePOS-refunderinger vises som en særskilt kilde og kan ikke annulleres med denne handling.",
            ],
          },
          {
            id: "eksport",
            title: "Vælg den rette eksport",
            bullets: [
              "Eksportér oversigt giver de samlede mængder for perioden.",
              "Eksportér registreringer giver de enkelte registreringer med deres detaljer.",
              "Dårlige leveringer har et særskilt afsnit. Åbn en registrering for at kontrollere dokumentation og meddelelsesstatus, også efter annullering.",
            ],
          },
        ],
        troubleshooting: [
          {
            question: "Hvorfor mangler oversigten eller eksporten?",
            answer:
              "Rapportvisning og eksport har separate rettigheder. Din rolle kan derfor have adgang til registreringer uden adgang til eksportoversigten.",
          },
        ],
        relatedLinks: [
          {
            href: "/help/waste/daarlig-levering",
            label: "Dårlige leveringer og meddelelser",
          },
        ],
      },
    ],
  },
  {
    slug: "staff-food",
    label: "Staff food",
    summary:
      "Vælg regler efter vagtlængde, og registrér medarbejdernes Produkter.",
    icon: UtensilsIcon,
    guides: [
      {
        slug: "overblik",
        label: "Overblik",
        summary:
          "Vælg regler efter vagtlængde, og registrér medarbejdernes Produkter.",
        appHref: "/staff-food",
        appLinkLabel: "Åbn Staff food",
        sections: [
          {
            id: "om",
            title: "Sådan fungerer Staff food",
            paragraphs: [
              "Staff food knytter produktvalg og mængder til medarbejderens vagtlængde. En regel angiver, hvilke Produkter der kan vælges, og det samlede antal i hver kategori.",
            ],
          },
          {
            id: "forloeb",
            title: "Fra opsætning til daglig brug",
            steps: [
              "Opret reglerne, og kontrollér dem med en medarbejder på vagt.",
              "Vælg medarbejder og Produkter, og bekræft registreringen. Brug en erstatningsvagt, når medarbejderen ikke har en aktiv vagt.",
            ],
          },
          {
            id: "foer-du-starter",
            title: "Før du starter",
            bullets: [
              "Workfeed skal være forbundet med de rigtige afdelinger på lokationerne.",
              "Kategorier og Produkter skal være oprettet. Ændring af regler kræver adgang til at administrere Staff food.",
            ],
          },
        ],
      },
      {
        slug: "registrering",
        label: "Opret regler og registrér Staff food",
        summary:
          "Vælg mængder og Produkter efter vagtlængde, og registrér medarbejderens Staff food.",
        appHref: "/staff-food",
        appLinkLabel: "Åbn Staff food",
        sections: [
          {
            id: "regler",
            title: "Opret regler efter vagtlængde",
            steps: [
              "Kontrollér Workfeed-forbindelsen og afdelingskoblingen for hver Lokation under Administration → Integrationer. Opret kategorier og Produkter, før du vælger dem i reglerne.",
              "Åbn Administration → Staff food, og vælg Ny regel. Angiv Minimum vagtlængde i hele eller halve timer fra 0,5 til 24.",
              "Tilføj en kategori-regel for hver kategori. Angiv det samlede antal, og vælg de konkrete tilladte Produkter. Produkterne i kategorien deler samme grænse.",
              "Gem reglen. Opret flere regler, hvis længere vagter skal give et andet antal eller andre Produkter. Reglen med den højeste opfyldte minimumsvagtlængde gælder; reglerne lægges ikke sammen.",
            ],
            screenshot: {
              src: "/help/screenshots/staff-food.webp",
              alt: "Ny Staff food-regel med minimumstimer, kategori og antal",
              caption:
                "Vælg kategori, samlet antal og tilladte Produkter for den angivne vagtlængde.",
              width: 944,
              height: 456,
            },
          },
          {
            id: "kontroller-regler",
            title: "Kontrollér produktvalg og grænser",
            bullets: [
              "Åbn Staff food, og vælg en medarbejder på vagt. Sammenhold Lokation, vagtlængde, kategoriantal og Produkter med den forventede regel.",
              "Kontrollér også en vagt under den første regels minimum. Den skal ikke udløse reglen.",
              "Gennemgå de tilladte Produkter igen, når produktkataloget ændres.",
            ],
          },
          {
            id: "registrer",
            title: "Registrér på den rigtige medarbejder",
            steps: [
              "Kontrollér Lokation, og vælg medarbejderen under På vagt nu. Brug søgningen, hvis medarbejderen ikke vises.",
              "Kontrollér vagtlængden og de tilgængelige kategorier.",
              "Vælg Produkter og antal. Tallet ved hver kategori viser, hvor meget der er tilbage efter tidligere registreringer og dit aktuelle valg.",
              "Vælg Registrér Staff food. Kontrollér medarbejder, Lokation, Produkter og antal, og vælg Bekræft registrering.",
            ],
          },
          {
            id: "erstatningsvagt",
            title: "Når medarbejderen mangler en aktiv vagt",
            steps: [
              "Søg efter medarbejderen blandt alle medarbejdere.",
              "Vælg medarbejderen med Erstatningsvagt, når der ikke findes en aktiv vagt.",
              "Angiv den samlede vagtlængde fra 0,5 til 24 timer i halve timer, og vælg Fortsæt. Erstatningsvagten gælder resten af dagen på denne Lokation.",
            ],
          },
          {
            id: "fortryd",
            title: "Fortryd en forkert registrering",
            paragraphs: [
              "Brug Fortryd i bekræftelsesbeskeden umiddelbart efter registrering. Skriv en begrundelse, og bekræft Fortryd registrering. Lageret føres tilbage.",
            ],
          },
        ],
        troubleshooting: [
          {
            question: "Hvorfor kan jeg ikke vælge flere Produkter?",
            answer:
              "Produkter i samme kategori deler kategoriens grænse. Tidligere registreringer og dit aktuelle valg tæller med. Der kan også mangle tilladte Produkter i reglen.",
          },
          {
            question: "Vagten udløser ingen regel",
            answer:
              "Vagtlængden er kortere end den første Staff food-regel. Kontrollér den registrerede vagtlængde; en Administrator kan kontrollere reglerne.",
          },
          {
            question: "Vagten er ikke aktiv",
            answer:
              "Vælg Skift medarbejder, og find den aktuelle vagt. Kontrollér Workfeed-forbindelsen og lokationskoblingen, hvis vagtdata mangler.",
          },
        ],
        relatedLinks: [
          {
            href: "/help/integrationer/workfeed",
            label: "Workfeed og vagtdata",
          },
        ],
      },
    ],
  },
  {
    slug: "egenkontrol",
    label: "Egenkontrol",
    summary:
      "Planlæg kontroller, registrér målinger, og saml opfølgning og dokumentation.",
    icon: ClipboardCheckIcon,
    guides: [
      {
        slug: "overblik",
        label: "Overblik",
        summary:
          "Planlæg kontroller, registrér målinger, og saml opfølgning og dokumentation.",
        appHref: "/own-checks",
        appLinkLabel: "Åbn dagens egenkontroller",
        sections: [
          {
            id: "om",
            title: "Sådan fungerer Egenkontrol",
            paragraphs: [
              "Egenkontrol samler de kontroller, lokationerne skal udføre. Skabeloner beskriver opgaven, felter og grænser; tidsplanen bestemmer, hvornår kontrollen vises.",
            ],
          },
          {
            id: "forloeb",
            title: "Fra opsætning til daglig brug",
            steps: [
              "Opret kontrollen og de fælles regler. Udfør derefter dagens kontroller og registrér eventuelle afvigelser.",
              "Følg op på afvigelser, ret fejl og godkend. Hent til sidst dokumentation for den ønskede Lokation og periode.",
            ],
          },
          {
            id: "foer-du-starter",
            title: "Før du starter",
            bullets: [
              "Lokationerne og deres tidszoner skal være korrekte.",
              "Aftal, hvem der opretter, udfører, retter og godkender kontroller. Handlingerne har særskilte rettigheder.",
            ],
          },
        ],
      },
      {
        slug: "udfoer",
        label: "Opret og udfør egenkontroller",
        summary:
          "Opret kontrollens felter og tidsplan, og følg instruktionerne ved den daglige registrering.",
        appHref: "/own-checks",
        appLinkLabel: "Åbn dagens egenkontroller",
        sections: [
          {
            id: "skabelon",
            title: "Opret kontrollen",
            paragraphs: [
              "Tidligere versioner bevares. Historiske kontroller beholder derfor de felter og grænser, der gjaldt, da de skulle udføres.",
            ],
            steps: [
              "Åbn Administration → Egenkontrol, og opret en egenkontrol. Angiv navn, kontroltype og en instruktion, der fortæller, hvad der skal udføres.",
              "Tilføj felter og relevante grænser. Vælg frekvens, Starter kl. og Forfalder kl. samt de lokationer, kontrollen gælder for. Kontrollér lokationernes tidszoner.",
              "Vælg eventuelt Ansvarlig rolle til visning og filtrering. Rollen begrænser ikke i sig selv, hvem der kan udføre kontrollen.",
              "Gem, og kontrollér i Egenkontrol → I dag, at kontrollen vises på den planlagte dato med de rigtige felter og frister.",
            ],
          },
          {
            id: "faelles-regler",
            title: "Vælg frister og fælles regler",
            steps: [
              "Indstil Frist for efterregistrering under Administration → Egenkontrol. Vælg 0, hvis en kontrol kun må registreres samme dag.",
              "Vælg, om Egenkontrol skal blokeres under Count, og om godkendelse kræver en anden person. Brugere med adgang til at administrere egenkontroller er undtaget fra kravet om en anden godkender.",
              "Angiv Begrundelse for ændringer, og gem indstillingerne.",
            ],
            screenshot: {
              src: "/help/screenshots/egenkontrol.webp",
              alt: "Fælles regler for efterregistrering, godkendelse og Count-blokering",
              caption:
                "Vælg de fælles regler, før kontrollerne tages i brug på lokationerne.",
              width: 711,
              height: 432,
            },
          },
          {
            id: "dagens-kontroller",
            title: "Start fra I dag",
            bullets: [
              "Kontrollér Lokation og dato. Mangler viser dagens kontroller, der endnu ikke er udført.",
              "Afvigelser viser kontroller med åben opfølgning. Udført i dag viser de øvrige registrerede kontroller.",
              "Manglende fra tidligere dage viser kontroller, der stadig kan efterregistreres.",
            ],
          },
          {
            id: "registrer",
            title: "Udfør og registrér",
            steps: [
              "Åbn kontrollen. Kontrollér den planlagte dato og frist, og læs Instruktioner og eventuelt billede.",
              "Udfyld målinger, valg og tekst. Felter med en stjerne er påkrævede. Følg den viste enhed og de tilladte decimaler.",
              "Tilføj billeder eller PDF-filer, hvis kontrollen har dokumentationsfelter. Vent på, at upload er færdig.",
              "Ved en afvigelse skal du udfylde Beskriv afvigelsen. Skriv også den korrigerende handling, hvis den allerede er udført.",
              "Vælg Registrér egenkontrol eller Registrér afvigelse. Kontrollér bagefter registreringen i I dag eller Oversigt.",
            ],
          },
          {
            id: "frister",
            title: "Efterregistrering og låste kontroller",
            paragraphs: [
              "Kontroller i fremtiden eller efter fristen for efterregistrering kan ikke registreres. Følg beskeden på siden, hvis Count blokerer Egenkontrol. Åbn en allerede registreret kontrol via Oversigt for at se dokumentation eller foretage en tilladt rettelse.",
            ],
          },
        ],
        troubleshooting: [
          {
            question: "Hvorfor er der ingen kontroller i dag?",
            answer:
              "Kontrollér Lokation. En Administrator kan kontrollere skabelonens aktive status, lokationer, startdato og frekvens under Administration → Egenkontrol.",
          },
        ],
        relatedLinks: [
          {
            href: "/help/egenkontrol/opfoelgning",
            label: "Afvigelser, rettelser og godkendelse",
          },
          {
            href: "/help/egenkontrol/dokumentation",
            label: "Find og eksportér dokumentation",
          },
        ],
      },
      {
        slug: "opfoelgning",
        label: "Følg op og godkend",
        summary:
          "Følg op på en afvigelse, ret registreringer med sporbarhed, og godkend udførte kontroller.",
        appHref: "/own-checks/overview",
        appLinkLabel: "Åbn Egenkontrol-oversigt",
        sections: [
          {
            id: "find",
            title: "Find kontrollen i Oversigt",
            steps: [
              "Vælg Lokation og en periode på højst 92 dage.",
              "Afgræns eventuelt med Kontroltype, Status eller Ansvarlig bruger. Status Afvigelse medtager også afvigelser, der senere er godkendt.",
              "Åbn en udført kontrol for at se værdier, grænser, vedhæftninger, opfølgning og ændringshistorik.",
            ],
          },
          {
            id: "handling",
            title: "Følg op og godkend",
            steps: [
              "Beskriv, hvad der er gjort, i Korrigerende handling, og vælg Registrér handling.",
              "Skal en eksisterende handling erstattes, så skriv både den nye handling og Begrundelse for erstatning.",
              "Når opfølgningen er løst, kan en Bruger med godkendelsesadgang vælge Godkend egenkontrol.",
            ],
            bullets: [
              "En åben afvigelse skal følges op, før kontrollen kan godkendes.",
              "Hvis organisationen kræver en anden godkender, kan den udførende Bruger ikke selv godkende. Brugere med adgang til at administrere egenkontroller er undtaget.",
            ],
          },
          {
            id: "rettelser",
            title: "Ret en registrering",
            steps: [
              "Vælg Ret registrering, hvis kontrollen endnu ikke er godkendt, og du har rettelsesadgang.",
              "Ret værdier, note eller dokumentation. Beskriv en eventuel afvigelse, og skriv Begrundelse for rettelse.",
              "Vælg Gem rettelse. Ændringen gemmes som en ny revision med Bruger, tidspunkt og begrundelse.",
            ],
          },
        ],
        troubleshooting: [
          {
            question: "Hvorfor mangler en handling?",
            answer:
              "Rettelse, korrigerende handling og godkendelse kræver hver sin adgang. Godkendte kontroller kan ikke rettes via Ret registrering.",
          },
        ],
        relatedLinks: [
          {
            href: "/help/egenkontrol/dokumentation",
            label: "Eksportér dokumentation",
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
              "Åbn Egenkontrol → Dokumentation. Funktionen kræver adgang til at eksportere kontroldokumentation.",
              "Vælg Lokation og fra- og til-dato. Perioden må højst være 366 dage. Hurtig periode kan vælge denne uge, denne måned eller de sidste tre måneder.",
              "Vælg Vis dokumentation, og vent på, at alle registreringer er hentet.",
              "Gennemgå udførte kontroller, afvigelser og manglende kontroller. Vælg Hent PDF eller Eksportér CSV.",
            ],
          },
          {
            id: "indhold",
            title: "Det skal du kontrollere",
            bullets: [
              "Rapportens Lokation, periode og tidspunkt for generering skal passe til det, du vil dokumentere.",
              "Kontrollér både de registrerede målinger og listen over manglende kontroller.",
              "Detaljer om afvigelser, korrigerende handlinger, godkendelser og revisioner forklarer, hvad der er sket efter den oprindelige registrering.",
              "Brug Opdatér dokumentation, hvis registreringer er ændret, siden rapporten blev hentet.",
            ],
          },
        ],
        troubleshooting: [
          {
            question: "Hvorfor kan jeg ikke eksportere endnu?",
            answer:
              "Alle sider skal være hentet, før eksporten er klar. Hvis du ændrer periode eller Lokation, skal du hente den nye dokumentation først.",
          },
          {
            question: "Dokumentationen er for stor",
            answer:
              "Vælg en kortere periode, og hent flere rapporter. En lang periode med mange kontroller kan overskride rapportens grænse.",
          },
        ],
        relatedLinks: [
          {
            href: "/help/egenkontrol/opfoelgning",
            label: "Afvigelser, rettelser og godkendelse",
          },
        ],
      },
    ],
  },
  {
    slug: "bestilling",
    label: "Bestilling",
    summary:
      "Beregn et forslag ud fra forbrug og lager, og eksportér en bestillingsplan.",
    icon: ShoppingCartIcon,
    guides: [
      {
        slug: "overblik",
        label: "Overblik",
        summary:
          "Beregn et forslag ud fra forbrug og lager, og eksportér en bestillingsplan.",
        appHref: "/ordering",
        appLinkLabel: "Åbn Bestilling",
        sections: [
          {
            id: "om",
            title: "Sådan fungerer Bestilling",
            paragraphs: [
              "Bestilling beregner et forslag ud fra forventet forbrug, lager, åbningstider og en buffer. Du gennemgår og retter mængderne, før planen eksporteres som CSV.",
            ],
          },
          {
            id: "forloeb",
            title: "Fra opsætning til daglig brug",
            steps: [
              "Kontrollér datagrundlaget, og vælg Lokation, dækning og buffer.",
              "Gennemgå forslag og advarsler, ret mængderne, og eksportér planen. CSV-filen sender ikke en bestilling til en leverandør.",
            ],
          },
          {
            id: "foer-du-starter",
            title: "Før du starter",
            bullets: [
              "Produkter, enheder, ingredienser og produktkoblinger skal være korrekte. Lager og åbningstider skal være ajour.",
              "Din rolle skal give adgang til planlægning og eksport.",
              "Indgående leverancer indgår ikke i forslaget. Tag højde for allerede bestilte Produkter.",
            ],
          },
        ],
      },
      {
        slug: "forslag",
        label: "Beregn og eksportér et forslag",
        summary:
          "Klargør forbrugsgrundlaget, tilpas dækning og buffer, og eksportér mængderne som CSV.",
        appHref: "/ordering",
        appLinkLabel: "Åbn Bestilling",
        sections: [
          {
            id: "opsaetning",
            title: "Klargør grundlaget",
            steps: [
              "Kontrollér Produkter, enheder og ingredienser under Administration → Produkter. Kontrollér derefter forbindelser og produktkoblinger til salgskilden under Integrationer.",
              "Hold Lager ajour, og kontrollér åbningstider og lukkedage under Administration → Lokationer.",
              "Åbn Administration → Bestilling. Vælg, om Medtag produkter med ingredienser skal være slået til, og gem. Valget skal passe til de Produkter, lokationen faktisk bestiller.",
            ],
            screenshot: {
              src: "/help/screenshots/bestilling.webp",
              alt: "Indstillingen Medtag produkter med ingredienser",
              caption:
                "Vælg, om bestillingslisten også skal indeholde Produkter, der selv består af ingredienser.",
              width: 711,
              height: 148,
            },
          },
          {
            id: "beregn",
            title: "Beregn og gennemgå forslaget",
            steps: [
              "Vælg Lokation. Angiv Dækning i dage fra 1 til 28 og Buffer i % fra 0 til 100. Dækningen starter i dag og skal rumme leveringstiden.",
              "Brug Opdatér forslag, hvis grundlaget skal opdateres. Åbn spørgsmålstegnet ved forslaget for at læse beregning og advarsler.",
              "Sammenhold Lager, Forventet forbrug og Forslag for hvert Produkt. Kontrollér enheden, og brug et Produkt med kendt forbrug og lager til at vurdere, om forslaget passer.",
              "Ret mængden under Bestil. Brug Brug forslag på en ændret linje for at vende tilbage til den beregnede mængde.",
            ],
          },
          {
            id: "grundlag",
            title: "Tag højde for det, tallene bygger på",
            bullets: [
              "Forslaget bruger historisk forbrug, åbningstider og lukkedage. Vejr og helligdage indgår, når der er tilstrækkelig historik.",
              "Staff food og aktiv Waste fremskrives særskilt og lægges til. Opskrifter omregnes med de nuværende ingredienser.",
              "Buffer lægges til, og positiv lagerbeholdning trækkes fra. Indgående leverancer er ikke medregnet, så tag højde for allerede bestilte Produkter.",
              "Ukendt lager, Intet forbrugsgrundlag og Begrænset datagrundlag kræver manuel vurdering. Manglende salgs-, produkt- eller enhedskoblinger kan give for lave forslag.",
            ],
          },
          {
            id: "csv",
            title: "Eksportér planen",
            steps: [
              "Kontrollér antallet af Produkter i bestillingen. CSV medtager alle mængder over nul, også Produkter uden for den aktuelle søgning.",
              "Vælg Eksportér CSV. Du skal have eksportadgang, og der kan højst eksporteres 500 Produkter ad gangen.",
              "Kontrollér Lokation, datoer, Produkter, enheder og mængder i filen. Eksporten er en plan; den sender ikke en bestilling til en leverandør.",
            ],
          },
        ],
        troubleshooting: [
          {
            question: "Hvorfor er eksporten deaktiveret?",
            answer:
              "Kontrollér adgang, dækning, buffer og mængder. Mængder skal være fra 0 til 1.000.000 med højst seks decimaler, og mindst ét Produkt skal have en mængde over nul.",
          },
        ],
        relatedLinks: [
          {
            href: "/help/count/lager-og-rapport",
            label: "Kontrollér Lager",
          },
          {
            href: "/help/varemodtagelse/manuel",
            label: "Registrér en manuel levering",
          },
        ],
      },
    ],
  },
];
