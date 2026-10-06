import { SettingsIcon, UserRoundIcon } from "lucide-react";
import type { HelpFeature } from "./help-types";

export const administrationFeatures: HelpFeature[] = [
  {
    slug: "administration",
    label: "Administration",
    summary:
      "Klargør lokationer og Produkter, vælg funktioner, tilpas udseendet, og giv eksterne systemer API-adgang.",
    icon: SettingsIcon,
    guides: [
      {
        slug: "overblik",
        label: "Overblik",
        summary:
          "Administration samler de lokationer, Produkter og indstillinger, som den daglige drift bygger på.",
        appHref: "/administration",
        appLinkLabel: "Åbn Administration",
        sections: [
          {
            id: "grundlag",
            title: "Fælles grundlag",
            paragraphs: [
              "Lokationer angiver, hvor arbejdet foregår. Produktkataloget angiver, hvad I registrerer, og hvordan mængder omregnes. Alle driftsfunktioner bruger de samme data. Du ser kun de områder i Administration, din rolle giver adgang til.",
            ],
          },
          {
            id: "raekkefoelge",
            title: "Klargør organisationen",
            steps: [
              "Opret lokationer med tidszone, valuta og åbningstider.",
              "Opret Produkter, enheder og kategorier. Vælg derefter Produkter og Områder for hver Lokation.",
              "Opret roller, og invitér Brugerne. Forbind de integrationer, I bruger.",
              "Gennemgå indstillingerne for hver driftsfunktion. Kontrollér med en Bruger fra den daglige drift, at Produkter, lokationer og handlinger er de rigtige.",
            ],
          },
          {
            id: "funktioner",
            title: "Slå funktioner til eller fra",
            paragraphs: [
              "Hver driftsfunktion har en Aktivering-kontakt øverst på sin side under Administration. Kontakten gælder hele organisationen. En slået fra funktion forsvinder fra sidemenuen og kan ikke bruges, men indstillinger og data bevares.",
            ],
          },
        ],
        relatedLinks: [
          { href: "/help/adgang-og-profil/overblik", label: "Adgang og profil" },
          { href: "/help/integrationer/overblik", label: "Integrationer" },
        ],
      },
      {
        slug: "lokationer",
        label: "Lokationer og åbningstider",
        summary:
          "Opret lokationer, angiv stamdata og åbningstider, og vælg lokationens Produkter og Områder.",
        appHref: "/administration/locations",
        appLinkLabel: "Åbn Lokationer",
        sections: [
          {
            id: "stamdata",
            title: "Opret en Lokation",
            steps: [
              "Åbn Administration → Lokationer, opret lokationen med et navn, og gem.",
              "Vælg Stamdata på lokationens række. Kontrollér Valuta, Tidszone og Status. Tomme felter bruger organisationens standard.",
              "Angiv efter behov Marked, Juridisk enhed, Operatør, Ejerskab, Konceptversion og Åbningsdato. Felterne bruges til lokationsvalg og rapporter.",
              "Søg lokationens Google-sted frem, og vælg virksomheden. Stedet bruges til Google-bedømmelsen på Dashboard og til vejr og helligdage i prognoser, når Vejr og helligdage i prognoser er slået til.",
            ],
            bullets: [
              "Prognoser deler kun koordinater og land med vejr- og kalendertjenesterne. Salgstal deles ikke.",
            ],
          },
          {
            id: "aabningstider",
            title: "Åbningstider og særlige datoer",
            steps: [
              "Vælg Åbningstider på lokationens række.",
              "Vælg Samme hver dag eller Hver ugedag. Angiv Åbner og Lukker, eller markér Lukket.",
              "Brug Tilføj dato under Særlige datoer til helligdage og andre afvigelser, og gem.",
            ],
            bullets: [
              "En lukketid før åbningstiden betyder lukning efter midnat.",
              "En særlig dato erstatter de faste tider den dag. Mindst én ugedag skal være åben.",
              "Count-vinduet, Bestilling og prognoser bruger åbningstiderne.",
            ],
          },
          {
            id: "produktvalg",
            title: "Vælg Produkter og Områder",
            paragraphs: [
              "Produkter og Områder bestemmer, hvilke Produkter lokationen bruger i Waste og Count, og i hvilken rækkefølge de tælles. Produkterne står i kolonner, som du trækker dem mellem:",
            ],
            bullets: [
              "Ikke brugt: Produktet bruges ikke på lokationen.",
              "Kun Waste: Produktet kan registreres som Waste, men tælles ikke.",
              "Count eller et Område: Produktet tælles i den viste rækkefølge. Opdel i Områder for at følge den fysiske rute, eksempelvis køl og tørvarer.",
              "Hold Shift, mens du trækker, for at kopiere et Produkt til flere Områder. Du kan også bruge menuen på produktkortet.",
              "Brug nye Produkter automatisk lægger nye Produkter i Kun Waste. Produkter i Ikke brugt forbliver fravalgt.",
              "En ingrediens i et valgt Produkt kan ikke flyttes til Ikke brugt. Produkter, der er udeladt fra Count for hele organisationen, kan ikke tælles.",
            ],
            steps: [
              "Vælg Produkter og områder på lokationens række.",
              "Træk Produkterne til den rigtige kolonne og rækkefølge. Søg, hvis listen er lang.",
              "Vælg Opdel i Områder eller Nyt Område for at oprette et Område. Gem ændringerne.",
            ],
            screenshot: {
              src: "/help/screenshots/lokation-produkter.webp",
              alt: "Produkter og Områder med kolonnerne Ikke brugt, Kun Waste og lokationens Count-områder",
              caption:
                "Træk et Produkt til den kolonne, det skal bruges i. Rækkefølgen i et Område er rækkefølgen ved Count. Eksempeldata.",
              width: 1280,
              height: 736,
            },
          },
        ],
        troubleshooting: [
          {
            question: "Hvorfor mangler et Produkt på en Lokation?",
            answer:
              "Kontrollér, at Produktet er aktivt, og at det ikke ligger i Ikke brugt under lokationens Produkter og Områder. Mangler det kun i Count, så kontrollér, om det ligger i Kun Waste eller er udeladt under Administration → Count.",
          },
        ],
        relatedLinks: [
          { href: "/help/count/udfoer", label: "Planlæg og udfør Count" },
          { href: "/help/administration/produkter", label: "Produkter og enheder" },
        ],
      },
      {
        slug: "produkter",
        label: "Produkter, enheder og opskrifter",
        summary:
          "Byg produktkataloget med enheder, ingredienser og holdbarhed. Importér, eksportér og arkivér Produkter.",
        appHref: "/administration/products",
        appLinkLabel: "Åbn Produkter",
        sections: [
          {
            id: "produkt",
            title: "Opret et Produkt",
            steps: [
              "Åbn Administration → Produkter, og vælg Nyt produkt. Angiv Navn og Kategorier. Nye kategorier kan oprettes direkte i feltet.",
              "Angiv Maksimal temperatur, hvis Produktet skal temperaturkontrolleres ved Transfer, og Holdbarhed, hvis det skal have datoetiketter. Tilføj eventuelt et billede.",
              "Vælg standardenheden under Enheder og omregninger. Tilføj andre pakninger med Tilføj enhed, og angiv, hvor mange standardenheder de svarer til.",
              "Tilføj ingredienser, hvis Produktet er en opskrift, og gem.",
            ],
            bullets: [
              "Omregningen går altid til standardenheden. Er standarden kg, og en kasse indeholder 5 kg, er kassens omregning 5.",
              "Ingredienser er andre Produkter med mængde og enhed. Kan fjernes markerer en ingrediens, kunden kan fravælge. Ingredienser, der kan tilføjes, er ekstra tilvalg.",
            ],
            screenshot: {
              src: "/help/screenshots/product-setup.webp",
              alt: "Produkteditor med produktdetaljer, enheder og omregninger samt ingredienser",
              caption:
                "Standardenheden er grundlaget for alle omregninger. Ingredienser er andre Produkter med egen mængde og enhed. Eksempeldata.",
              width: 1204,
              height: 600,
            },
          },
          {
            id: "enheder-og-opskrift",
            title: "Kategorier og enheder",
            bullets: [
              "Fanen Kategorier samler Produkter og underkategorier. Brug Ny underkategori eller Redigér til at ændre opdelingen.",
              "Fanen Enheder viser alle enheder. Sammenlæg flytter Produkter og aktive opsætninger fra en dublet til den valgte enhed. Historiske registreringer bevares.",
            ],
          },
          {
            integration: "onlinepos",
            id: "menuer",
            title: "Menuer fra OnlinePOS",
            steps: [
              "Åbn fanen Menuer, og vælg Ny menu.",
              "Angiv Navn, og vælg Menu i OnlinePOS. Vælg masterforbindelse, hvis I har flere.",
              "Opret en gruppe for hvert valg i menuen, eksempelvis Hovedret og Drikke. Angiv Antal valg, og vælg gruppens Produkter.",
              "Vælg Opret menu, og opret de OnlinePOS-koblinger, advarslerne peger på.",
            ],
            bullets: [
              "Menuen samler salgslinjer til 0 kr. ud fra Produkternes OnlinePOS-koblinger. Menuer kan også vælges ved registrering af Faktura.",
              "Sletning af en menu fjerner kun grupperingen. Gemte salgslinjer bevares.",
            ],
          },
          {
            id: "vedligehold",
            title: "Importér, eksportér og arkivér",
            bullets: [
              "Eksportér giver en ZIP-fil med kataloget. Importér indlæser en eksporteret fil og opretter manglende kategorier og enheder.",
              "Ved samme produktnavn vælger du Spring over eller Overskriv. Overskriv erstatter produktdata og billeder og omregner lager og opskrifter.",
              "Arkivér fjerner Produktet fra vælgerne. Det kan gendannes fra arkivet i 30 dage, før det slettes permanent.",
              "Permanent sletning fjerner også billede, enheder, opskrift og brugen som ingrediens. Det kan ikke fortrydes.",
            ],
          },
        ],
        troubleshooting: [
          {
            integration: "onlinepos",
            question: "Hvorfor kan jeg ikke se Menuer eller OnlinePOS-koblinger?",
            answer:
              "Menuer kræver adgang til at administrere integrationer, og OnlinePOS skal være forbundet og aktiveret. Et nyt Produkt skal gemmes, før dets OnlinePOS-kobling kan vælges.",
          },
          {
            question: "Produktet blev gemt, men billedet mangler?",
            answer:
              "Produktdata kan være gemt, selv om upload af billedet fejlede. Åbn Produktet igen, og tilføj billedet.",
          },
        ],
        relatedLinks: [
          { href: "/help/administration/lokationer", label: "Produkter pr. Lokation" },
          { integration: "onlinepos", href: "/help/integrationer/onlinepos", label: "OnlinePOS" },
        ],
      },
      {
        slug: "udseende-og-sidemenu",
        label: "Udseende, sidemenu og feedback",
        summary:
          "Vælg farver og logoer, sortér sidemenuen, og bestem, hvor Brugernes feedback lander.",
        appHref: "/administration/appearance",
        appLinkLabel: "Åbn Udseende",
        sections: [
          {
            id: "farver",
            title: "Farver",
            steps: [
              "Åbn Administration → Udseende. Vælg Automatisk for en farveskala ud fra grundfarverne eller Fuldt tilpasset for at vælge hver farve.",
              "Kontrollér Forhåndsvisning, ret farver med for lav kontrast, og vælg Gem farver.",
            ],
          },
          {
            id: "logoer",
            title: "Appikon og navigationslogo",
            bullets: [
              "Appikon skal være kvadratisk. Navigationslogo passer bedst omkring 4:1, gerne med gennemsigtig baggrund.",
              "Brug JPEG, PNG eller WebP. Filer på op til 10 MB komprimeres automatisk.",
              "Fjern logo kræver bekræftelse. Appen bruger derefter standardvisningen.",
            ],
          },
          {
            id: "sidemenu",
            title: "Sidemenuens rækkefølge",
            steps: [
              "Åbn Administration → Sidemenu, og træk menupunkterne i den ønskede rækkefølge. Med tastatur vælger du med mellemrum, flytter med piletasterne og placerer med mellemrum.",
              "Vælg Gem rækkefølge. Den gælder hele organisationen, også kiosker.",
            ],
            bullets: [
              "Brugerne ser stadig kun de menupunkter, de har adgang til.",
            ],
          },
          {
            id: "feedback",
            title: "Feedback fra Brugerne",
            paragraphs: [
              "Med Tillad feedback kan Brugerne vælge Send feedback i appen og indsende en Fejl eller et Forslag med titel, beskrivelse og eventuelt skærmbillede.",
            ],
            steps: [
              "Åbn Administration → Feedback, og slå Tillad feedback til.",
              "Vælg Modtager: e-mail eller Linear. Ved e-mail angiver du adressen. Ved Linear indtaster du en API-nøgle, henter teams og vælger Team. Du kan også sende en kopi til en e-mailadresse.",
              "Gem. Seneste feedback viser indsendt feedback og om den blev sendt.",
            ],
          },
        ],
        relatedLinks: [
          { href: "/administration/sidebar", label: "Åbn Sidemenu" },
          { href: "/administration/feedback", label: "Åbn Feedback" },
        ],
      },
      {
        slug: "api",
        label: "API-adgang",
        summary:
          "Giv et eksternt system adgang med en API-nøgle med egen rolle, lokationsadgang og udløbsdato.",
        appHref: "/administration/api",
        appLinkLabel: "Åbn API",
        sections: [
          {
            id: "opret",
            title: "Opret en API-nøgle",
            steps: [
              "Åbn Administration → API, og vælg Ny API-nøgle. Giv nøglen et navn efter systemet.",
              "Vælg Udløbsdato. Standard er 90 dage, og højst ét år.",
              "Vælg Rolle, fjern de Tilladelser, systemet ikke skal bruge, og vælg Lokationsadgang.",
              "Vælg Opret og vis hemmelighed, og kopiér nøglen til systemet. Hemmeligheden vises kun én gang.",
            ],
          },
          {
            id: "kontrol",
            title: "Kontrollér og ændr adgang",
            bullets: [
              "Oversigten viser status, udløb, Senest brugt, rolle og lokationsadgang.",
              "Redigér adgang ændrer rolle, tilladelser og lokationer. Rollens datavisning gælder også nøglen.",
              "API-dokumentationen beskriver de tilgængelige kald.",
            ],
          },
          {
            id: "rotation",
            title: "Rotér eller tilbagekald",
            steps: [
              "Vælg Rotér, angiv Ny udløbsdato, og gem den nye hemmelighed i systemet. Den gamle nøgle virker fortsat.",
              "Tilbagekald den gamle nøgle, når systemet bruger den nye. Tilbagekald virker straks og kan ikke fortrydes.",
            ],
          },
        ],
        troubleshooting: [
          {
            question: "Kan jeg få vist en glemt API-nøgle?",
            answer:
              "Nej. Rotér en aktiv nøgle, eller opret en ny, hvis nøglen er udløbet eller tilbagekaldt.",
          },
          {
            question: "Hvorfor mangler det eksterne system data?",
            answer:
              "Kontrollér nøglens status, tilladelser, lokationsadgang og rollens datavisning.",
          },
        ],
        relatedLinks: [
          { href: "/api/v1/docs", label: "Åbn API-dokumentationen" },
          { href: "/help/adgang-og-profil/brugere-og-roller", label: "Roller og datavisning" },
        ],
      },
    ],
  },
  {
    slug: "adgang-og-profil",
    label: "Adgang og profil",
    summary:
      "Opret konto og organisation, invitér Brugere, vælg roller og lokationsadgang, og klargør fælles tablets.",
    icon: UserRoundIcon,
    guides: [
      {
        slug: "overblik",
        label: "Overblik",
        summary:
          "Rollen bestemmer handlinger og datavisning. Lokationsadgangen bestemmer, hvor Brugeren må arbejde.",
        appHref: "/administration/users",
        appLinkLabel: "Åbn Brugere",
        sections: [
          {
            id: "adgang",
            title: "Rolle og Lokation",
            paragraphs: [
              "Rollen bestemmer, hvilke handlinger en Bruger må udføre, og om vedkommende ser detaljer, kun totaler eller anonymiserede data. Lokationsadgangen bestemmer, hvilke lokationer Brugeren kan vælge. Kontrollér begge, når en Bruger starter eller skifter opgaver.",
            ],
          },
          {
            id: "personlig-og-faelles",
            title: "Personlig konto eller fælles enhed",
            bullets: [
              "Personlige konti oprettes via invitation. Se Brugere, invitationer og roller.",
              "En fælles tablet bruger en kioskkonto med fast Lokation og udvalgte sider. Se Fælles tablet og kiosk.",
              "Din egen konto, adgangskode og kontosletning findes under Konto og login.",
            ],
          },
        ],
        relatedLinks: [
          { href: "/help/administration/api", label: "Adgang for eksterne systemer" },
        ],
      },
      {
        slug: "brugere-og-roller",
        label: "Brugere, invitationer og roller",
        summary:
          "Vælg rollernes handlinger, invitér Brugere, og giv dem adgang til de rigtige lokationer.",
        appHref: "/administration/users",
        appLinkLabel: "Åbn Brugere",
        sections: [
          {
            id: "roller",
            title: "Roller og datavisning",
            steps: [
              "Åbn Administration → Brugere → Roller og adgang. Brug Administrator, Manager og Medlem, eller vælg Ny rolle.",
              "Markér rollens handlinger, og vælg Datavisning: Detaljer, Kun totaler eller Anonymiseret.",
              "Angiv Begrundelse, og gem. Ændringen gælder alle Brugere med rollen.",
            ],
            bullets: [
              "Visning, registrering, eksport og indstillinger er separate handlinger for hver funktion.",
              "En tilpasset rolle kan kun slettes, når ingen Brugere har den. De indbyggede roller kan ikke slettes.",
            ],
            screenshot: {
              src: "/help/screenshots/adgang-og-profil.webp",
              alt: "Roller og adgang med datavisning og handlinger for Administrator, Manager og Medlem",
              caption:
                "Hver kolonne er en rolle. Kontrollér både datavisning og handlinger. Markeringerne er et eksempel.",
              width: 1020,
              height: 775,
            },
          },
          {
            id: "invitation",
            title: "Invitér en Bruger",
            steps: [
              "Åbn fanen Brugere. Angiv E-mail og Rolle under Invitér bruger, og vælg Send invitation.",
              "Brugeren åbner linket og logger ind eller opretter en konto med samme e-mailadresse. Invitationen kan også indløses med koden under Tilmeld med kode.",
              "Tildel lokationsadgang, når Brugeren står på listen.",
            ],
            bullets: [
              "Invitationer udløber efter syv dage. Afventende invitationer kan annulleres nederst på siden.",
            ],
          },
          {
            id: "lokationsadgang",
            title: "Lokationsadgang",
            steps: [
              "Åbn feltet i kolonnen Lokationer, og angiv Begrundelse.",
              "Vælg Alle lokationer, bestemte lokationer eller en Operatør. Valget gemmes med det samme.",
            ],
            bullets: [
              "Du kan ikke ændre din egen rolle eller den sidste Administrator.",
              "Fjern bruger fjerner adgangen til organisationen efter bekræftelse. Kontoen slettes ikke.",
            ],
          },
        ],
        troubleshooting: [
          {
            question: "Brugeren kan åbne siden, men ikke udføre handlingen?",
            answer:
              "Kontrollér den konkrete handling under Roller og adgang og Brugerens lokationsadgang. At se og at registrere eller eksportere er forskellige handlinger.",
          },
          {
            question: "Invitationen siger, at jeg bruger den forkerte konto?",
            answer:
              "Vælg Log ud og skift konto på invitationssiden, og log ind med den e-mailadresse, invitationen er sendt til. Bed om en ny invitation, hvis den er udløbet.",
          },
        ],
        relatedLinks: [
          { href: "/help/adgang-og-profil/kiosk", label: "Fælles tablet og kiosk" },
          { href: "/help/administration/api", label: "API-adgang" },
        ],
      },
      {
        slug: "kiosk",
        label: "Fælles tablet og kiosk",
        summary:
          "Klargør en fælles enhed med fast Lokation, tilladte sider, startside og automatisk nulstilling.",
        appHref: "/administration/kiosk",
        appLinkLabel: "Åbn Kiosk",
        sections: [
          {
            id: "opsatning",
            title: "Vælg kioskens sider",
            steps: [
              "Åbn Administration → Kiosk, og vælg de sider, kiosker må bruge, under Kiosktilstand.",
              "Vælg Startside. Slå eventuelt Nulstil ved inaktivitet til, og angiv 5–3600 sekunder.",
              "Vælg Gem kioskopsætning.",
            ],
            bullets: [
              "Nulstilling sender kiosken til startsiden og rydder igangværende arbejde.",
              "Egenkontroloversigt tillader korrigerende handlinger, og Kontroldokumentation tillader eksport, uanset kontoens rolle.",
            ],
          },
          {
            id: "konto",
            title: "Opret en kioskkonto",
            steps: [
              "Angiv Navn, Brugernavn (3–30 tegn) og Adgangskode (mindst 12 tegn) under Opret kioskkonto.",
              "Vælg fast Lokation og Normal rolle, og vælg Opret kioskkonto.",
              "Log ind på tabletten med brugernavnet. Kontrollér Lokation, startside og sider.",
            ],
            bullets: [
              "Kioskkontoen starter i kiosktilstand. Hold skærmen tændt i sidemenuen forhindrer, at tabletten går i dvale.",
              "Deaktivér kiosktilstand i sidemenuen giver kontoen den normale brugerflade med rollens adgang.",
              "Redigér kioskkonto ændrer navn og fast Lokation.",
            ],
          },
          {
            id: "enheder",
            title: "Adgangskode og sessioner",
            bullets: [
              "Skift adgangskode gælder nye login. Indloggede tablets forbliver logget ind.",
              "Log ud på alle enheder afslutter alle kontoens sessioner.",
              "Slet kioskkonto sletter kontoen og dens sessioner permanent.",
            ],
          },
        ],
        relatedLinks: [
          { href: "/help/administration/udseende-og-sidemenu", label: "Rækkefølge i sidemenuen" },
          { href: "/help/adgang-og-profil/brugere-og-roller", label: "Roller" },
        ],
      },
      {
        slug: "profil-og-login",
        label: "Konto og login",
        summary:
          "Opret en konto og en organisation, nulstil adgangskoden, eller slet din konto.",
        appHref: "/profile",
        appLinkLabel: "Åbn Profil",
        sections: [
          {
            id: "opret",
            title: "Opret konto og organisation",
            steps: [
              "Vælg Opret konto på login-siden. Angiv Navn, E-mail og en adgangskode på mindst 12 tegn.",
              "Åbn bekræftelseslinket i e-mailen.",
              "Vælg Opret organisation for at starte en ny organisation, eller Tilmeld med kode for at indløse en invitation. Du bliver Administrator i en ny organisation.",
            ],
          },
          {
            id: "profil",
            title: "Profil",
            paragraphs: [
              "Profil i kontomenuen viser dit navn og din e-mail. Fra kontomenuen åbner du også Hjælp, Administration og Log ud.",
            ],
          },
          {
            id: "adgangskode",
            title: "Ny adgangskode",
            steps: [
              "Vælg Glemt adgangskode på login-siden, angiv e-mailen, og vælg Send nulstillingslink.",
              "Åbn linket, angiv Ny adgangskode to gange, og vælg Gem ny adgangskode.",
            ],
            bullets: [
              "Kioskkonti logger ind med brugernavn og får ny adgangskode af en Administrator.",
            ],
          },
          {
            id: "sletning",
            title: "Slet din konto",
            steps: [
              "Åbn Profil, og vælg Slet min konto. Er du eneste Administrator, skal en anden Bruger først have rollen.",
              "Indtast din adgangskode, og vælg Slet konto permanent.",
            ],
            bullets: [
              "Kun din personlige konto og adgang slettes. Organisationens data bevares.",
            ],
          },
        ],
        troubleshooting: [
          {
            question: "Jeg har en konto, men mangler adgang til organisationen?",
            answer:
              "Åbn invitationen, og log ind med den e-mailadresse, den blev sendt til. Er du allerede tilføjet, skal en Administrator kontrollere din rolle og dine lokationer.",
          },
        ],
        relatedLinks: [
          { href: "/forgot-password", label: "Få et nulstillingslink" },
        ],
      },
    ],
  },
];
