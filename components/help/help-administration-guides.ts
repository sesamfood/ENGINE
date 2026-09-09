import { SettingsIcon, UserRoundIcon } from "lucide-react";
import type { HelpFeature } from "./help-types";

export const administrationFeatures: HelpFeature[] = [
  {
    slug: "administration",
    label: "Administration",
    summary:
      "Klargør lokationer og produktkatalog, tilpas udseendet, og giv eksterne systemer API-adgang.",
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
            title: "Ét fælles grundlag for organisationen",
            paragraphs: [
              "Lokationer fortæller, hvor arbejdet foregår. Produktkataloget bestemmer, hvad I registrerer, og hvordan mængder omregnes. De samme grunddata bruges i blandt andet Transfer, Waste, Count og Bestilling.",
              "Du skal have adgang til de administrationsområder, du vil ændre. Hav lokationernes åbningstider og en liste over Produkter og pakninger klar.",
            ],
          },
          {
            id: "raekkefoelge",
            title: "Klargør organisationen i denne rækkefølge",
            bullets: [
              "Opret lokationer med tidszone, valuta og åbningstider. Byg derefter produktkataloget, og vælg lokationernes Produkter og Områder.",
              "Giv Brugerne roller og lokationsadgang i kapitlet Adgang og profil. Forbind derefter de systemer, I bruger, i kapitlet Integrationer.",
              "Følg opsætningen i hver driftsfunktion. Kontrollér med en Bruger fra den daglige drift, at de rigtige Produkter, lokationer og handlinger er tilgængelige.",
              "Tilpas udseende og sidemenu efter behov. API-adgang er kun nødvendig, hvis et eksternt system skal bruge appens data.",
            ],
          },
        ],
        relatedLinks: [
          {
            href: "/help/adgang-og-profil/overblik",
            label: "Adgang og profil",
          },
          { href: "/help/integrationer/overblik", label: "Integrationer" },
        ],
      },
      {
        slug: "lokationer",
        label: "Lokationer og åbningstider",
        summary:
          "Opret lokationer, angiv deres stamdata, og hold åbningstider og produktvalg ajour.",
        appHref: "/administration/locations",
        appLinkLabel: "Åbn Lokationer",
        sections: [
          {
            id: "stamdata",
            title: "Opret og klargør en Lokation",
            steps: [
              "Åbn Administration → Lokationer, opret lokationen med et navn, og gem.",
              "Åbn Stamdata på lokationens række. Kontrollér Valuta, Tidszone og Status. Tomme felter bruger organisationens standarder.",
              "Angiv Marked, Juridisk enhed, Operatør, Ejerskab, Konceptversion og Åbningsdato, hvor det er relevant, og gem oplysningerne.",
            ],
            bullets: [
              "Vejr og helligdage i prognoser kræver, at du søger efter og vælger en adresse. Koordinater og landekode deles med vejr- og kalenderudbyderne. Salgstal deles ikke.",
            ],
          },
          {
            id: "aabningstider",
            title: "Faste tider og særlige datoer",
            steps: [
              "Åbn Åbningstider med urikonet på lokationens række.",
              "Vælg Samme hver dag eller Hver ugedag. Angiv Åbner og Lukker, eller markér Lukket på den enkelte dag.",
              "Brug Tilføj dato under Særlige datoer til helligdage og andre afvigelser. Angiv de ændrede tider eller Lukket, og gem åbningstiderne.",
            ],
            bullets: [
              "En lukketid før åbningstiden betyder lukning efter midnat. Åbning og lukning må ikke have samme klokkeslæt.",
              "Særlige datoer erstatter de faste tider den pågældende dag. Hver dato må kun forekomme én gang, og mindst én fast ugedag skal være åben.",
              "Åbningstiderne bruges af Count-vinduet og Bestilling. Kontrollér dem, når en Lokation ændrer sin drift.",
            ],
          },
          {
            id: "produktvalg",
            title: "Vælg Produkter og Områder",
            steps: [
              "Når produktkataloget er klar, åbner du Produkter og Områder på lokationens række. Vælg de relevante Produkter eller Brug alle aktive Produkter, og gem valget.",
              "Åbn Områder for at opdele Count efter eksempelvis lager eller køkken. Opret et Område, og vælg dets Produkter og rækkefølge.",
            ],
            bullets: [
              "Lokationens produktvalg gælder både Count og Waste. Et nyt Produkt vises kun automatisk, når lokationen bruger alle aktive Produkter.",
              "Rækkefølgen i et Område kan tilpasses her eller på Count-siden, når du har valgt Området.",
            ],
          },
        ],
        troubleshooting: [
          {
            question: "Hvorfor mangler et Produkt på en Lokation?",
            answer:
              "Kontrollér, at Produktet er aktivt i produktkataloget og valgt under lokationens Produkter og Områder. Kontrollér også Områdets produktvalg, hvis det kun mangler i en del af Count.",
          },
        ],
        relatedLinks: [
          { href: "/help/count/overblik", label: "Count og Count-vinduet" },
          { href: "/help/bestilling/overblik", label: "Bestillingsforslag" },
          {
            href: "/help/administration/produkter",
            label: "Produkter, enheder og opskrifter",
          },
        ],
      },
      {
        slug: "produkter",
        label: "Produkter, enheder og opskrifter",
        summary:
          "Byg produktkataloget med korrekte omregninger, ingredienser og koblinger til salg. Brug import og arkivering til at vedligeholde det.",
        appHref: "/administration/products",
        appLinkLabel: "Åbn Produkter",
        sections: [
          {
            id: "produkt",
            title: "Opret et Produkt",
            steps: [
              "Åbn Administration → Produkter, og vælg Nyt produkt. Angiv navn og kategorier. Du kan vælge eksisterende kategorier eller oprette dem i formularen.",
              "Angiv Maksimal temperatur, når Produktet skal temperaturkontrolleres ved Transfer. Tilføj eventuelt et billede, og tilpas beskæringen.",
              "Under Enheder og omregninger vælger du standardenheden. Brug Tilføj enhed til andre pakninger, og angiv, hvor mange standardenheder én af dem svarer til.",
              "Tilføj eventuelle ingredienser, og vælg Opret produkt. Åbn Produktet igen for at kontrollere opsætningen og tilføje en OnlinePOS-kobling, når integrationen er forbundet.",
            ],
            screenshot: {
              src: "/help/screenshots/product-setup.webp",
              alt: "Produkteditor med produktdetaljer, standardenhed, omregninger og ingredienser",
              caption:
                "Standardenheden er grundlaget for omregningerne. Ingredienser angives som andre Produkter med deres egen mængde og enhed. Eksempeldata.",
              width: 1165,
              height: 1006,
            },
          },
          {
            id: "enheder-og-opskrift",
            title: "Kontrollér omregninger og opskrift",
            bullets: [
              "Omregningen går til standardenheden. Hvis standarden er kg, og én kasse indeholder 5 kg, skal kassen have omregningen 5.",
              "Ingredienser er Produkter, der indgår som standard. Vælg Produkt, Mængde og Enhed for hver ingrediens.",
              "Kan fjernes angiver en ingrediens, kunden kan fravælge. Ingredienser, der kan tilføjes, er ekstra valg og indgår ikke som standard. OnlinePOS-koblinger til til- og fravalg kræver den relevante integrationsopsætning.",
              "Kategorier har egen fane og kan indeholde både Produkter og underkategorier. Brug Ny underkategori eller Redigér til at tilpasse opdelingen.",
              "Under fanen Enheder kan Sammenlæg enheder samle dubletter. Produkter og aktive opsætninger flyttes til den valgte enhed, mens historiske registreringer bevares.",
            ],
          },
          {
            id: "menuer",
            title: "Saml OnlinePOS-produkter i menuer",
            steps: [
              "Forbind og aktivér OnlinePOS. Åbn fanen Menuer i produktkataloget, og vælg Ny menu.",
              "Angiv Navn, vælg Menu i OnlinePOS, og vælg mindst ét primært Produkt samt eventuelle ekstra Produkter fra kataloget.",
              "Gem menuen. Kontrollér advarsler om manglende OnlinePOS-koblinger, og opret koblingerne på de berørte Produkter.",
            ],
            bullets: [
              "Menuen samler efterfølgende produktlinjer til 0 kr. ud fra Produkternes OnlinePOS-koblinger. Et valgt Produkt kan gemmes i menuen, men salgslinjen genkendes først, når koblingen findes.",
              "Fjernelse af en menu sletter grupperingsopsætningen. Gemte salgs- og ordrelinjer bevares.",
            ],
          },
          {
            id: "vedligehold",
            title: "Importér, eksportér eller arkivér",
            bullets: [
              "Brug Eksportér i produktkataloget til en ZIP-fil og Importér til at indlæse en eksporteret produktfil. Importen opretter manglende kategorier og enheder.",
              "Ved samme produktnavn vælger du Spring over eller Overskriv. Overskriv erstatter produktdata og billeder og omregner lager og opskrifter til de importerede enheder. Læs resultatet for eventuelle dele, der ikke kunne importeres.",
              "Arkivér fjerner Produktet fra produkt- og ingrediensvælgerne. Du kan gendanne det fra arkivet, indtil det slettes permanent efter 30 dage.",
              "Permanent sletning fjerner også Produktets billede, enheder og opskrift samt brugen af Produktet som ingrediens i andre opskrifter. Handlingen kan ikke fortrydes.",
            ],
          },
        ],
        troubleshooting: [
          {
            question:
              "Hvorfor kan jeg ikke se Menuer eller OnlinePOS-koblinger?",
            answer:
              "Menuer kræver integrationsadgang. Kontrollér din rolle og, at OnlinePOS er forbundet og aktiveret. Et nyt Produkt skal gemmes, før dets OnlinePOS-kobling kan vælges.",
          },
          {
            question:
              "Produktet blev gemt, men billedet eller koblingen mangler?",
            answer:
              "Produktdata kan være gemt, selv om upload af billedet eller en ingredienskobling fejlede. Læs fejlbeskeden, åbn Produktet igen, og ret den del, der mangler.",
          },
        ],
        relatedLinks: [
          { href: "/help/integrationer/onlinepos", label: "OnlinePOS" },
          { href: "/administration/menus", label: "Åbn Menuer" },
          {
            href: "/help/administration/lokationer",
            label: "Produktvalg pr. Lokation",
          },
        ],
      },
      {
        slug: "udseende-og-sidemenu",
        label: "Udseende og sidemenu",
        summary:
          "Vælg organisationens farver og logoer, og læg de hyppigste funktioner først i sidemenuen.",
        appHref: "/administration/appearance",
        appLinkLabel: "Åbn Udseende",
        sections: [
          {
            id: "farver",
            title: "Tilpas farver",
            steps: [
              "Åbn Administration → Udseende. Vælg Automatisk for en farveskala baseret på grundfarverne eller Fuldt tilpasset for at vælge de enkelte farver.",
              "Kontrollér Forhåndsvisning. Ret farverne, hvis formularen viser, at de mangler kontrast, og vælg Gem farver.",
            ],
          },
          {
            id: "logoer",
            title: "Tilføj appikon og navigationslogo",
            steps: [
              "Vælg fil under Appikon. Brug et kvadratisk billede, da det beskæres til rammen, og vælg Gem logo.",
              "Tilføj Navigationslogo på samme måde. Et bredt billede omkring 4:1, gerne med gennemsigtig baggrund, passer til navigationen.",
            ],
            bullets: [
              "Brug JPEG, PNG eller WebP. Et mindre billede på højst 2 MB er et godt udgangspunkt. Formularen kan komprimere en kildefil på op til 10 MB.",
              "Fjern logo kræver bekræftelse. Navigationen bruger derefter standardvisningen, indtil du gemmer et nyt logo.",
            ],
          },
          {
            id: "sidemenu",
            title: "Flyt de vigtigste menupunkter op",
            steps: [
              "Åbn Administration → Sidemenu. Træk menupunkterne til den ønskede rækkefølge.",
              "Med tastatur vælger du et menupunkt med mellemrum, flytter med piletasterne og placerer med mellemrum igen. Escape annullerer flytningen.",
              "Vælg Gem rækkefølge. Rækkefølgen gælder hele organisationen, også kiosker.",
            ],
            bullets: [
              "Brugerne ser fortsat kun menupunkter, de har adgang til. Ændring af rækkefølgen giver ingen nye rettigheder.",
            ],
          },
        ],
        relatedLinks: [
          { href: "/administration/sidebar", label: "Åbn Sidemenu" },
          {
            href: "/help/adgang-og-profil/brugere-og-roller",
            label: "Brugere og roller",
          },
          {
            href: "/help/adgang-og-profil/kiosk",
            label: "Fælles tablet og kiosk",
          },
        ],
      },
      {
        slug: "api",
        label: "API-adgang",
        summary:
          "Giv et eksternt system adgang med en API-nøgle. Vælg rolle, handlinger, lokationer og udløbsdato for hver nøgle.",
        appHref: "/administration/api",
        appLinkLabel: "Åbn API",
        sections: [
          {
            id: "opret",
            title: "Opret en API-nøgle",
            steps: [
              "Åbn Administration → API, og vælg Ny API-nøgle. Giv nøglen et navn, der beskriver det eksterne system.",
              "Vælg Udløbsdato. Standard er 90 dage, og nøglen kan højst være gyldig i ét år.",
              "Vælg Rolle, og fjern de Tilladelser, systemet ikke behøver. Vælg alle lokationer, valgte lokationer eller en operatørs lokationer under Lokationsadgang, alt efter de valg du har adgang til.",
              "Vælg Opret og vis hemmelighed. Kopiér nøglen til det system, der skal bruge den, og gem den sikkert, før du lukker vinduet. Hemmeligheden vises kun denne ene gang.",
            ],
          },
          {
            id: "kontrol",
            title: "Kontrollér og ændr adgang",
            bullets: [
              "Oversigten viser status, udløbsdato, seneste brug, rolle og lokationsadgang. Kontrollér Senest brugt efter systemets første kald.",
              "Redigér adgang ændrer rolle, tilladelser og lokationsadgang. Navn og udløbsdato ændres ikke her.",
              "Rollens datavisning bestemmer, om adgangen er til detaljer, samlede data eller anonymiserede data. Nøglen kan kun få handlinger fra den valgte rolle.",
            ],
          },
          {
            id: "rotation",
            title: "Udskift eller tilbagekald en nøgle",
            steps: [
              "Vælg Rotér på en aktiv nøgle, angiv Ny udløbsdato, og vælg Rotér og vis hemmelighed.",
              "Gem den nye hemmelighed i det eksterne system, og kontrollér, at forbindelsen virker. Den gamle nøgle er stadig aktiv under overgangen.",
              "Tilbagekald den gamle nøgle, når systemet bruger den nye. Tilbagekald fjerner adgangen med det samme og kan ikke fortrydes.",
            ],
          },
        ],
        troubleshooting: [
          {
            question: "Kan jeg få vist en glemt API-nøgle igen?",
            answer:
              "Nej. Rotér en aktiv nøgle for at oprette en ny hemmelighed. En udløbet eller tilbagekaldt nøgle kan ikke roteres fra oversigten, så opret en ny nøgle.",
          },
          {
            question: "Hvorfor mangler det eksterne system data?",
            answer:
              "Kontrollér nøglens status, rolle, tilladelser og lokationsadgang. Kontrollér også rollens datavisning, hvis systemet får totaler, men mangler detaljer.",
          },
        ],
        relatedLinks: [
          { href: "/api/v1/docs", label: "Åbn API-dokumentationen" },
          {
            href: "/help/adgang-og-profil/brugere-og-roller",
            label: "Roller og datavisning",
          },
        ],
      },
    ],
  },
  {
    slug: "adgang-og-profil",
    label: "Adgang og profil",
    summary:
      "Invitér Brugere, vælg roller og lokationsadgang, og klargør fælles tablets og personlige konti.",
    icon: UserRoundIcon,
    guides: [
      {
        slug: "overblik",
        label: "Overblik",
        summary:
          "Giv hver Bruger adgang til de handlinger, data og lokationer, vedkommende skal bruge. Klargør en kiosk til fælles enheder.",
        appHref: "/administration/users",
        appLinkLabel: "Åbn Brugere",
        sections: [
          {
            id: "adgang",
            title: "Rolle og Lokation bestemmer adgangen",
            paragraphs: [
              "Rollen bestemmer, hvad en Bruger må gøre, og om vedkommende ser detaljer, totaler eller anonymiserede data. Lokationsadgangen bestemmer, hvor Brugeren må arbejde. Kontrollér begge dele, når en Bruger bliver inviteret eller skifter opgaver.",
              "Administration kræver de relevante rettigheder. Aftal først de handlinger og lokationer, hver Bruger skal have adgang til.",
            ],
          },
          {
            id: "personlig-og-faelles",
            title: "Vælg adgang til personen eller enheden",
            bullets: [
              "Start med Brugere, invitationer og roller. Vælg rollernes handlinger, invitér Brugerne, og kontrollér deres lokationsadgang.",
              "Brug Kiosk til en fælles tablet med fast Lokation. Vælg tilladte sider, startside og eventuel nulstilling ved inaktivitet.",
              "Profil og login beskriver din personlige konto, adgangskode og kontosletning. Din adgang til organisationens funktioner ændres under Administration → Brugere.",
            ],
          },
        ],
        relatedLinks: [
          {
            href: "/help/administration/api",
            label: "Adgang til eksterne systemer",
          },
        ],
      },
      {
        slug: "brugere-og-roller",
        label: "Brugere, invitationer og roller",
        summary:
          "Invitér Brugere, vælg deres handlinger og datavisning, og giv adgang til de rigtige lokationer.",
        appHref: "/administration/users",
        appLinkLabel: "Åbn Brugere",
        sections: [
          {
            id: "roller",
            title: "Vælg rollens handlinger og datavisning",
            steps: [
              "Åbn Administration → Brugere → Roller og adgang. Brug Administrator, Manager eller Medlem, eller vælg Ny rolle for at oprette en tilpasset rolle.",
              "Markér de handlinger, rollen må udføre. Vælg Datavisning som Detaljer, Kun totaler eller Anonymiseret.",
              "Angiv Begrundelse, og gem rollerne. Ændringen gælder de Brugere, der har rollen.",
            ],
            bullets: [
              "En tilpasset rolle kan kun slettes, når ingen Brugere har den. De indbyggede roller kan ikke slettes.",
            ],
            screenshot: {
              src: "/help/screenshots/adgang-og-profil.webp",
              alt: "Roller og adgang med datavisning og handlinger fordelt på Administrator, Manager og Medlem",
              caption:
                "Læs én rolle ad gangen, og kontrollér både datavisning og handlinger. De markerede rettigheder er et eksempel.",
              width: 1064,
              height: 546,
            },
          },
          {
            id: "invitation",
            title: "Invitér en Bruger",
            steps: [
              "Åbn fanen Brugere. Under Invitér bruger angiver du E-mail og Rolle og vælger Send invitation.",
              "Brugeren åbner linket i e-mailen og vælger Log ind eller Opret konto med den samme e-mailadresse. Invitationen accepteres, når Brugeren er logget ind.",
              "Kontrollér Brugeren i listen over aktive Brugere, og tildel den ønskede lokationsadgang.",
            ],
            bullets: [
              "Afventende invitationer vises nederst på siden og udløber efter syv dage. Annullér invitation stopper linket med det samme efter bekræftelse.",
            ],
          },
          {
            id: "lokationsadgang",
            title: "Vælg, hvor Brugeren må arbejde",
            steps: [
              "Find Brugeren, og åbn feltet i kolonnen Lokationer. Angiv Begrundelse, før du ændrer valget.",
              "Vælg Alle lokationer, bestemte lokationer eller en Operatør. Ved bestemte lokationer skal mindst én være valgt. Ændringer gemmes, når du vælger.",
              "Kontrollér med Brugeren, at lokationsvælgeren og de nødvendige handlinger svarer til den tildelte adgang.",
            ],
            bullets: [
              "Rollen bestemmer handlinger og datavisning. Lokationsadgangen bestemmer de lokationer, Brugeren må bruge.",
              "Du kan ændre en anden Brugers rolle i listen. Din egen rolle og den sidste Administrator er beskyttet mod ændring her.",
              "Fjern bruger kræver bekræftelse og fjerner adgangen til organisationen. Sletning af den personlige konto foregår under Profil.",
            ],
          },
        ],
        troubleshooting: [
          {
            question: "Brugeren kan åbne siden, men ikke udføre en handling?",
            answer:
              "Kontrollér den konkrete handling i Roller og adgang og Brugernes lokationsadgang. Adgang til at se en side og adgang til at registrere eller eksportere kan være forskellige valg.",
          },
          {
            question: "Invitationen siger, at jeg bruger den forkerte konto?",
            answer:
              "Vælg Log ud og skift konto på invitationssiden. Log ind med den e-mailadresse, invitationen blev sendt til. Bed om en ny invitation, hvis linket er udløbet eller annulleret.",
          },
        ],
        relatedLinks: [
          {
            href: "/help/adgang-og-profil/kiosk",
            label: "Kiosk til fælles enheder",
          },
          {
            href: "/help/adgang-og-profil/profil-og-login",
            label: "Profil og login",
          },
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
            title: "Vælg, hvad kiosken skal kunne",
            steps: [
              "Åbn Administration → Kiosk. Under Kiosktilstand vælger du de sider, kiosker må bruge.",
              "Vælg en Startside blandt de aktiverede sider.",
              "Slå eventuelt Nulstil ved inaktivitet til, og angiv tiden i sekunder fra 5 til 3600. Vælg Gem kioskopsætning.",
            ],
            bullets: [
              "Nulstilling sender kiosken tilbage til startsiden og rydder igangværende arbejde. Vælg en tid, der giver plads til de registreringer, enheden skal bruges til.",
              "Læs advarslerne ved de enkelte sider. Egenkontroloversigt tillader korrigerende handlinger, og Kontroldokumentation tillader eksport, uanset kontoens normale rolle.",
            ],
          },
          {
            id: "konto",
            title: "Opret og afprøv en kioskkonto",
            steps: [
              "Under Opret kioskkonto angiver du Navn, Brugernavn og Adgangskode. Brugernavnet skal være fra 3 til 30 tegn, og adgangskoden mindst 12 tegn.",
              "Vælg den faste Lokation og Normal rolle, og vælg Opret kioskkonto.",
              "Log ind på den fælles enhed med kioskkontoen. Kontrollér Lokation, Startside og de tilladte sider. Afprøv også nulstilling, hvis den er slået til.",
            ],
            bullets: [
              "Kioskkontoen starter altid i kiosktilstand. Navn og fast Lokation kan ændres med Redigér kioskkonto.",
            ],
          },
          {
            id: "enheder",
            title: "Skift adgangskode eller afslut sessioner",
            bullets: [
              "Skift adgangskode gælder fremtidige login. Allerede indloggede tablets fortsætter deres sessioner.",
              "Log ud på alle enheder afslutter kontoens aktive sessioner efter bekræftelse. Alle tablets med kontoen skal logge ind igen, og adgangskoden ændres ikke.",
              "Slet kioskkonto sletter kontoen, adgangskoden og alle aktive sessioner permanent efter bekræftelse.",
            ],
          },
        ],
        troubleshooting: [
          {
            question:
              "Hvorfor er tabletten stadig logget ind efter et skift af adgangskode?",
            answer:
              "Et skift af adgangskode afslutter ikke aktive kiosksessioner. Brug Log ud på alle enheder, hvis alle enheder med kontoen skal logge ind igen.",
          },
        ],
        relatedLinks: [
          {
            href: "/help/administration/udseende-og-sidemenu",
            label: "Rækkefølge i sidemenuen",
          },
          {
            href: "/help/adgang-og-profil/brugere-og-roller",
            label: "Brugere og roller",
          },
        ],
      },
      {
        slug: "profil-og-login",
        label: "Profil og login",
        summary:
          "Se dine kontooplysninger, få en ny adgangskode, eller slet din personlige konto.",
        appHref: "/profile",
        appLinkLabel: "Åbn Profil",
        sections: [
          {
            id: "profil",
            title: "Se dine kontooplysninger",
            paragraphs: [
              "Profil viser det navn og den e-mailadresse, din konto er oprettet med. Din rolle og lokationsadgang administreres under Administration → Brugere.",
            ],
          },
          {
            id: "adgangskode",
            title: "Få en ny adgangskode",
            steps: [
              "Vælg Glemt adgangskode på login-siden. Indtast kontoens e-mailadresse, og vælg Send nulstillingslink.",
              "Åbn linket fra e-mailen. Angiv Ny adgangskode på mindst 12 tegn, og skriv den igen under Gentag adgangskode.",
              "Vælg Gem ny adgangskode, og log ind med den nye adgangskode.",
            ],
            bullets: [
              "Hvis linket er ugyldigt eller udløbet, vælger du Send et nyt link. Beskeden efter en anmodning bekræfter ikke, om e-mailadressen har en konto.",
            ],
          },
          {
            id: "sletning",
            title: "Slet din personlige konto",
            steps: [
              "Åbn Profil → Slet min konto. Er du den eneste Administrator, skal en anden Bruger først have rollen Administrator.",
              "Læs bekræftelsen, indtast din adgangskode, og vælg Slet konto permanent, hvis kontoen skal slettes.",
            ],
            bullets: [
              "Sletningen fjerner din personlige konto, dine sessioner og din adgang permanent. Organisationens øvrige data slettes ikke.",
            ],
          },
        ],
        troubleshooting: [
          {
            question:
              "Jeg har en konto, men mangler adgang til organisationen?",
            answer:
              "Åbn organisationens invitation, og log ind med den e-mailadresse, den blev sendt til. Hvis du allerede er tilføjet, skal en Bruger med den nødvendige administrationsadgang kontrollere din rolle og dine lokationer.",
          },
        ],
        relatedLinks: [
          { href: "/forgot-password", label: "Få et nulstillingslink" },
          {
            href: "/help/adgang-og-profil/brugere-og-roller",
            label: "Invitationer og adgang",
          },
        ],
      },
    ],
  },
];
