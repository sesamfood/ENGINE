import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRightLeftIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  LayoutDashboardIcon,
  SettingsIcon,
  ShoppingBagIcon,
  Trash2Icon,
  UserRoundIcon,
  UsersRoundIcon,
  UtensilsIcon,
} from "lucide-react";
import {
  AccessVisual,
  AdministrationVisual,
  CountVisual,
  DashboardVisual,
  EmployeesVisual,
  OwnChecksVisual,
  StaffFoodVisual,
  TransferVisual,
  WasteVisual,
  WoltVisual,
} from "@/components/help/help-visuals";

export type SettingControl =
  | { kind: "switch"; value: string }
  | { kind: "select"; value: string }
  | { kind: "fields"; values: string[] }
  | { kind: "mapping"; from: string; to: string }
  | { kind: "permissions"; value: string }
  | { kind: "schedule"; value: string };

export type HelpSetting = {
  title: string;
  description: string;
  control: SettingControl;
};

export type HelpFeature = {
  slug: string;
  number: string;
  label: string;
  title: string;
  summary: string;
  steps: string[];
  note: string;
  icon: LucideIcon;
  visual: ComponentType;
  visualLabel: string;
  caption: string;
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
    title: "Saml driften i widgets",
    summary:
      "Dashboard viser målinger som omsætning, Waste og arbejdstimer. Periode og lokationsvalg styrer alle widgets på siden.",
    steps: [
      "Vælg dashboard, periode og lokationer øverst.",
      "Tilføj en widget, og vælg måling, visualisering og størrelse.",
      "Flyt widgets, så de vigtigste tal står først.",
      "Del en læsevisning, hvis andre skal følge tallene.",
    ],
    note:
      "Et delt dashboard kan få adgangskode og udløbsdato. Du kan tilbagekalde linket senere.",
    icon: LayoutDashboardIcon,
    visual: DashboardVisual,
    visualLabel: "Dashboard med filtre, nøgletal og diagrammer",
    caption: "Periode og lokationsvalg gælder hele dashboardet.",
    appHref: "/dashboard",
    appLinkLabel: "Åbn Dashboard",
    settingsTitle: "Dashboardindstillinger",
    settingsIntro:
      "Tandhjulet styrer selve dashboardet. Hver widget har sine egne valg.",
    settingsHref: "/dashboard",
    settingsLinkLabel: "Åbn Dashboardindstillinger",
    settings: [
      {
        title: "Navn og rækkefølge",
        description: "Omdøb dashboardet, og flyt fanerne i den ønskede rækkefølge.",
        control: { kind: "fields", values: ["Navn", "Rækkefølge"] },
      },
      {
        title: "Adgang",
        description: "Vælg roller, der må se dashboardet. Ingen valg betyder alle roller.",
        control: { kind: "permissions", value: "Roller" },
      },
      {
        title: "Standarddashboard",
        description: "Sæt en standard for organisationen, bestemte roller eller lokationer.",
        control: { kind: "select", value: "Organisation, rolle eller Lokation" },
      },
      {
        title: "Widget",
        description: "Vælg måling, visualisering, størrelse, salgskilde og eventuelle aksegrænser.",
        control: { kind: "fields", values: ["Måling", "Visning", "Størrelse"] },
      },
      {
        title: "Deling",
        description: "Angiv navn, udløb og en valgfri adgangskode til læselinket.",
        control: { kind: "fields", values: ["Navn", "Udløb", "Adgangskode"] },
      },
    ],
  },
  {
    slug: "wolt-ordrer",
    number: "02",
    label: "Wolt-ordrer",
    title: "Følg ordre og status",
    summary:
      "Wolt-ordrer samler varelinjer, beløb, produktkoblinger og statushistorik på tværs af lokationer.",
    steps: [
      "Filtrér på dato, Lokation, status eller ordrenummer.",
      "Åbn en ordre for at se varer og koblede Produkter.",
      "Læs statushistorikken fra modtagelse til afslutning.",
    ],
    note: "Systemet gemmer og viser ikke forbrugeroplysninger.",
    icon: ShoppingBagIcon,
    visual: WoltVisual,
    visualLabel: "Wolt-ordreliste med varelinjer og statushistorik",
    caption: "Ordren viser kun de data, driften bruger.",
    appHref: "/wolt-orders",
    appLinkLabel: "Åbn Wolt-ordrer",
    settingsTitle: "Wolt-indstillinger",
    settingsIntro:
      "Wolt sættes op under Administration og Integrationer. Indstillingerne kræver integrationsadgang.",
    settingsHref: "/organization/integrations",
    settingsLinkLabel: "Åbn Wolt-indstillinger",
    settings: [
      {
        title: "Aktivering",
        description: "Slå modtagelse af nye Wolt-ordrer til eller fra for organisationen.",
        control: { kind: "switch", value: "Wolt aktiv" },
      },
      {
        title: "Forbindelse pr. Lokation",
        description: "Start SSIO, eller gem et WIO partner-venue-id. Status vises på hver Lokation.",
        control: { kind: "fields", values: ["SSIO", "WIO-id", "Status"] },
      },
      {
        title: "Produktkoblinger",
        description: "Kobl hver observeret Wolt-vare til et lokalt Produkt.",
        control: { kind: "mapping", from: "Wolt-vare", to: "Produkt" },
      },
      {
        title: "Hvor koblingen gælder",
        description: "Brug koblingen på én Lokation eller på tværs af organisationen.",
        control: { kind: "select", value: "Lokation eller alle" },
      },
      {
        title: "Drift og fejl",
        description: "Prøv fejlede events igen, godkend forbindelsen på ny, eller afbryd den.",
        control: { kind: "fields", values: ["Prøv igen", "Godkend", "Afbryd"] },
      },
    ],
  },
  {
    slug: "transfer",
    number: "03",
    label: "Transfer",
    title: "Flyt lager mellem lokationer",
    summary:
      "Transfer flytter Produkter fra én Lokation til en anden og gemmer ansvarlig, transferdato, mængder og temperaturer.",
    steps: [
      "Vælg fra- og til-lokation samt ansvarlig.",
      "Tilføj Produkter, enheder og mængder.",
      "Registrér temperatur, når Produktet kræver det.",
      "Opret transferen, og kontrollér den i Transferhistorik.",
    ],
    note:
      "Transferhistorik kan filtreres og eksporteres. Temperaturafvigelser markeres på transferen.",
    icon: ArrowRightLeftIcon,
    visual: TransferVisual,
    visualLabel: "Transfer mellem to lokationer med Produktlinjer",
    caption: "Lageret flyttes, når transferen oprettes.",
    appHref: "/transfers",
    appLinkLabel: "Opret Transfer",
    settingsTitle: "Det Transfer bruger",
    settingsIntro:
      "Transfer har ingen særskilt indstillingsside. Funktionen bruger fælles grunddata og roller.",
    settingsHref: "/organization/products",
    settingsLinkLabel: "Åbn Produktopsætning",
    settings: [
      {
        title: "Lokationer",
        description: "Aktive lokationer bliver til valg under Fra lokation og Til lokation.",
        control: { kind: "mapping", from: "Fra Lokation", to: "Til Lokation" },
      },
      {
        title: "Produkter og enheder",
        description: "Produktkataloget bestemmer, hvad der kan flyttes, og hvilke enheder der kan bruges.",
        control: { kind: "fields", values: ["Produkt", "Enhed", "Omregning"] },
      },
      {
        title: "Maksimal temperatur",
        description: "En temperaturgrænse på Produktet gør temperaturfeltet synligt og markerer afvigelser.",
        control: { kind: "fields", values: ["Maks. °C"] },
      },
      {
        title: "Rettigheder",
        description: "Roller kan få særskilt adgang til at oprette, se og eksportere transfers.",
        control: { kind: "permissions", value: "Opret, se og eksportér" },
      },
    ],
  },
  {
    slug: "waste",
    number: "04",
    label: "Waste",
    title: "Registrér tab og dårlige leveringer",
    summary:
      "Waste trækker kasserede Produkter fra lageret. Dårlig levering gemmer billeder, dokumentation og de berørte Produkter.",
    steps: [
      "Vælg Lokation og medarbejder.",
      "Brug en genvej, eller søg efter et Produkt og angiv mængden.",
      "Ved dårlig levering tilføjer du billeder, Produkter og kommentar.",
      "Brug Waste-rapporten til kontrol, eksport eller annullering.",
    ],
    note:
      "Når en aktiv Waste-registrering annulleres, lægges mængden tilbage på lageret. Ændringsloggen bevares.",
    icon: Trash2Icon,
    visual: WasteVisual,
    visualLabel: "Waste-registrering, dårlig levering og rapport",
    caption: "Registrering, dokumentation og opfølgning hænger sammen.",
    appHref: "/waste",
    appLinkLabel: "Registrér Waste",
    settingsTitle: "Waste-indstillinger",
    settingsIntro:
      "Indstillingerne styrer genveje, nulstilling og håndtering af dårlige leveringer.",
    settingsHref: "/organization/waste",
    settingsLinkLabel: "Åbn Waste-indstillinger",
    settings: [
      {
        title: "Nulstil efter inaktivitet",
        description: "Åbn Registrér med tom søgning, Alle Produkter og lukkede dialoger efter det valgte antal sekunder.",
        control: { kind: "fields", values: ["Sekunder"] },
      },
      {
        title: "Popularitetsperiode",
        description: "Bestem hvor langt tilbage appen ser, når den foreslår Waste-genveje.",
        control: { kind: "select", value: "Valgt periode" },
      },
      {
        title: "Historik til genveje",
        description: "Beregn popularitet fra den valgte Lokation eller hele organisationen.",
        control: { kind: "switch", value: "Hele organisationen" },
      },
      {
        title: "Lager ved dårlig levering",
        description: "Vælg standard for lagerfradrag, og om valget vises under registrering.",
        control: { kind: "fields", values: ["Træk fra lager", "Vis valg"] },
      },
      {
        title: "E-mail om dårlig levering",
        description: "Sæt modtagere, emne og indhold. Skabelonen kan indsætte data fra registreringen.",
        control: { kind: "fields", values: ["Til", "Emne", "Indhold"] },
      },
    ],
  },
  {
    slug: "egenkontrol",
    number: "05",
    label: "Egenkontrol",
    title: "Udfør dagens kontroller",
    summary:
      "Egenkontrol viser planlagte kontroller, frister, afvigelser og godkendelser for hver Lokation.",
    steps: [
      "Vælg Lokation, og åbn en kontrol under I dag.",
      "Udfyld felterne og gem registreringen.",
      "Følg op på en afvigelse, før kontrollen godkendes.",
      "Brug Oversigt og Dokumentation til historik og inspektionsrapport.",
    ],
    note: "Organisationen kan kræve, at en anden person godkender kontrollen.",
    icon: ClipboardCheckIcon,
    visual: OwnChecksVisual,
    visualLabel: "Dagens egenkontroller med afvigelse og godkendelse",
    caption: "Status viser, hvad der mangler, afviger eller er godkendt.",
    appHref: "/own-checks",
    appLinkLabel: "Åbn Egenkontrol",
    settingsTitle: "Indstillinger for egenkontrol",
    settingsIntro:
      "Skabeloner bestemmer indhold og tid. Reglerne bestemmer efterregistrering og godkendelse.",
    settingsHref: "/organization/own-checks",
    settingsLinkLabel: "Åbn indstillinger for egenkontrol",
    settings: [
      {
        title: "Skabelon og felter",
        description: "Vælg navn, kontroltype og felter. Tidligere versioner bevares i historikken.",
        control: { kind: "fields", values: ["Navn", "Type", "Felter"] },
      },
      {
        title: "Tidsplan",
        description: "Vælg frekvens, frist og de lokationer, der skal udføre kontrollen.",
        control: { kind: "schedule", value: "Frekvens og frist" },
      },
      {
        title: "Efterregistrering",
        description: "Angiv hvor mange dage tilbage en kontrol må registreres.",
        control: { kind: "fields", values: ["Antal dage"] },
      },
      {
        title: "Godkendelse",
        description: "Kræv en anden person til at godkende den udførte kontrol.",
        control: { kind: "switch", value: "Kræv anden person" },
      },
      {
        title: "Count-blokering",
        description: "Blokér Egenkontrol, mens en låsende Count er i gang.",
        control: { kind: "switch", value: "Blokér under Count" },
      },
    ],
  },
  {
    slug: "staff-food",
    number: "06",
    label: "Staff food",
    title: "Registrér mad til medarbejdere",
    summary:
      "Staff food bruger vagtens længde og organisationens regler til at vise, hvilke Produkter medarbejderen må vælge.",
    steps: [
      "Find medarbejderen, eller vælg en person på vagt.",
      "Kontrollér Lokation og vagtlængde.",
      "Vælg Produkter inden for de viste kategori-regler.",
      "Kontrollér kurven, og bekræft registreringen.",
    ],
    note:
      "Hvis medarbejderen ikke er på vagt, kan en manuel vagtlængde bruges, når reglerne tillader det.",
    icon: UtensilsIcon,
    visual: StaffFoodVisual,
    visualLabel: "Medarbejder, Staff food-regel og valgte Produkter",
    caption: "Appen finder først reglen og viser derefter de tilladte Produkter.",
    appHref: "/staff-food",
    appLinkLabel: "Åbn Staff food",
    settingsTitle: "Staff food-indstillinger",
    settingsIntro:
      "Reglerne kobler vagtlængde til kategorier, antal og tilladte Produkter.",
    settingsHref: "/organization/staff-food",
    settingsLinkLabel: "Åbn Staff food-indstillinger",
    settings: [
      {
        title: "Minimum vagtlængde",
        description: "Vælg det mindste antal timer, der udløser reglen. Den højeste matchende regel gælder.",
        control: { kind: "schedule", value: "0,5 til 24 timer" },
      },
      {
        title: "Kategori-regler",
        description: "Vælg en kategori og det samlede antal, medarbejderen må tage fra den.",
        control: { kind: "fields", values: ["Kategori", "Antal"] },
      },
      {
        title: "Tilladte Produkter",
        description: "Vælg de konkrete Produkter, som må bruges under hver kategori.",
        control: { kind: "permissions", value: "Valgte Produkter" },
      },
      {
        title: "Eksport",
        description: "Hent aktive og annullerede registreringer som CSV for en periode og Lokation.",
        control: { kind: "fields", values: ["Fra", "Til", "Lokation"] },
      },
    ],
  },
  {
    slug: "count",
    number: "07",
    label: "Count",
    title: "Afstem lageret",
    summary:
      "Count tæller lageret pr. Produkt og enhed. Organisationen kan dele optællingen i områder og styre et fast Count-vindue.",
    steps: [
      "Vælg Lokation og Count-område.",
      "Tæl ét Produkt ad gangen, eller brug gittervisningen.",
      "Angiv mængden i den rigtige enhed.",
      "Registrér Count med en begrundelse, og kontrollér Lager bagefter.",
    ],
    note:
      "En afsluttet Count kan ikke rettes. Kun Produkter med en angivet mængde overskriver lageret.",
    icon: ClipboardListIcon,
    visual: CountVisual,
    visualLabel: "Count-områder, Produktmængder og fremdrift",
    caption: "Områder kan tælles hver for sig. Fremdriften viser, hvad der mangler.",
    appHref: "/count",
    appLinkLabel: "Åbn Count",
    settingsTitle: "Count-indstillinger",
    settingsIntro:
      "Count-vinduet følger lokationens åbningstider. Organisationen vælger frekvens og låseadfærd.",
    settingsHref: "/organization/count",
    settingsLinkLabel: "Åbn Count-indstillinger",
    settings: [
      {
        title: "Uden for Count-vinduet",
        description: "Tillad eller afvis registrering, når det planlagte Count-vindue er lukket.",
        control: { kind: "switch", value: "Tillad uden for vinduet" },
      },
      {
        title: "Lås andre funktioner",
        description: "Begræns kiosken til Count og Waste, mens Count er i gang.",
        control: { kind: "switch", value: "Lås under Count" },
      },
      {
        title: "Kræv Count før åbning",
        description: "Hold Count-vinduet åbent, indtil optællingen er registreret.",
        control: { kind: "switch", value: "Count skal afsluttes" },
      },
      {
        title: "Frekvens",
        description: "Planlæg en månedlig Count-dag eller et interval med første dato.",
        control: { kind: "schedule", value: "Månedlig eller interval" },
      },
      {
        title: "Salgskilde",
        description: "Vælg OnlinePOS eller Wolt til Waste-rapporten for hver Lokation.",
        control: { kind: "select", value: "OnlinePOS eller Wolt" },
      },
      {
        title: "Områder og rækkefølge",
        description: "Lokationsopsætningen deler Produkter i Count-områder og bestemmer tællerækkefølgen.",
        control: { kind: "fields", values: ["Område", "Produkter", "Rækkefølge"] },
      },
    ],
  },
  {
    slug: "medarbejdere",
    number: "08",
    label: "Medarbejdere",
    title: "Se vagter og medarbejdere",
    summary:
      "Medarbejdere viser vagtplan og register fra Workfeed for de lokationer, du har adgang til.",
    steps: [
      "Vælg uge og Lokation i Vagtplan.",
      "Læs vagter og tider i lokationens tidszone.",
      "Åbn Register for at finde en bestemt medarbejder.",
    ],
    note: "Workfeed er kilden til både vagter og medarbejderregister.",
    icon: UsersRoundIcon,
    visual: EmployeesVisual,
    visualLabel: "Ugentlig vagtplan og medarbejderregister",
    caption: "Vagtplan og register bruger de afdelinger, der er koblet i Workfeed.",
    appHref: "/employees",
    appLinkLabel: "Åbn Medarbejdere",
    settingsTitle: "Opsætning af Medarbejdere",
    settingsIntro:
      "Medarbejdere har ingen særskilt indstillingsside. Workfeed og Vagtplan leverer opsætningen.",
    settingsHref: "/organization/integrations",
    settingsLinkLabel: "Åbn Workfeed-indstillinger",
    settings: [
      {
        title: "Workfeed-forbindelse",
        description: "Gem CompanyID og API-nøgle, og kontrollér forbindelsen.",
        control: { kind: "fields", values: ["CompanyID", "API-nøgle"] },
      },
      {
        title: "Afdeling pr. Lokation",
        description: "Kobl hver Lokation til den rigtige Workfeed-afdeling.",
        control: { kind: "mapping", from: "Lokation", to: "Afdeling" },
      },
      {
        title: "Tidszone",
        description: "Vælg tidszonen, som vagtplanens datoer og klokkeslæt vises i.",
        control: { kind: "select", value: "Organisationens tidszone" },
      },
      {
        title: "Rettigheder",
        description: "Giv roller adgang til Vagtplan, Register eller begge dele.",
        control: { kind: "permissions", value: "Vagtplan og Register" },
      },
    ],
  },
  {
    slug: "administration",
    number: "09",
    label: "Administration",
    title: "Sæt organisationen op",
    summary:
      "Administration samler grunddata, driftsregler, integrationer, design og teknisk adgang.",
    steps: [
      "Opret først Produkter, enheder og lokationer.",
      "Invitér Brugere, og giv dem roller og lokationsadgang.",
      "Indstil de funktioner, organisationen bruger.",
      "Forbind Workfeed, OnlinePOS og Wolt til sidst.",
    ],
    note: "Hver Bruger ser kun de områder, rollen giver adgang til.",
    icon: SettingsIcon,
    visual: AdministrationVisual,
    visualLabel: "Alle områder i Administration grupperet efter formål",
    caption: "Start med Grunddata. Tilføj driftsregler og integrationer bagefter.",
    appHref: "/organization",
    appLinkLabel: "Åbn Administration",
    settingsTitle: "Alle administrationsområder",
    settingsIntro:
      "Administration er selve indstillingsområdet. Brug denne rækkefølge, når en ny organisation sættes op.",
    settingsHref: "/organization",
    settingsLinkLabel: "Åbn Administration",
    settings: [
      {
        title: "Grunddata",
        description: "Produkter, kategorier, enheder, lokationer, åbningstider, Brugere og roller.",
        control: { kind: "fields", values: ["Produkter", "Lokationer", "Brugere"] },
      },
      {
        title: "Driftsregler",
        description: "Count, Waste, Egenkontrol, Staff food, Vagtplan og kiosk.",
        control: { kind: "fields", values: ["Count", "Waste", "Kiosk"] },
      },
      {
        title: "Integrationer",
        description: "Workfeed leverer medarbejdere, OnlinePOS leverer salg, og Wolt leverer ordrer.",
        control: { kind: "mapping", from: "Eksternt system", to: "Lokation" },
      },
      {
        title: "Dashboarddata",
        description: "Opret tilpassede målinger fra de kuraterede datasæt.",
        control: { kind: "fields", values: ["Datasæt", "Måling", "Gruppering"] },
      },
      {
        title: "API",
        description: "Opret nøgler med egne rettigheder, lokationer, operatør og udløbsdato.",
        control: { kind: "permissions", value: "Nøgleadgang" },
      },
      {
        title: "Udseende og navigation",
        description: "Vælg logoer, farver og rækkefølgen i sidemenuen.",
        control: { kind: "fields", values: ["Logo", "Farver", "Sidemenu"] },
      },
      {
        title: "Feedback",
        description: "Slå feedback til, vælg modtager, og se de seneste beskeder.",
        control: { kind: "switch", value: "Feedback aktiv" },
      },
    ],
  },
  {
    slug: "adgang-og-profil",
    number: "10",
    label: "Adgang og profil",
    title: "Styr, hvem der kan hvad",
    summary:
      "Roller styrer handlinger og datavisning. Lokationsadgang begrænser, hvilke lokationer en Bruger kan arbejde med.",
    steps: [
      "Brug Administrator, Manager eller Medlem som udgangspunkt.",
      "Tilpas roller, rettigheder og lokationsadgang i Administration.",
      "Åbn Profil for at se kontooplysninger eller slette din konto.",
      "Brug kiosk, delte dashboards eller REST API til særlige adgangsbehov.",
    ],
    note:
      "Kioskkonti bindes til én Lokation. De kan få en fast startside og vende tilbage efter inaktivitet.",
    icon: UserRoundIcon,
    visual: AccessVisual,
    visualLabel: "Roller, lokationsadgang, Profil, deling og REST API",
    caption: "Rolle og Lokation arbejder sammen. Begge dele begrænser adgangen.",
    appHref: "/profile",
    appLinkLabel: "Åbn Profil",
    settingsTitle: "Adgangsindstillinger",
    settingsIntro:
      "Brugere får en rolle og et lokationsvalg. Rollen bestemmer handlinger og detaljeniveau.",
    settingsHref: "/organization/users/roles",
    settingsLinkLabel: "Åbn Roller og adgang",
    settings: [
      {
        title: "Invitation og rolle",
        description: "Invitér en Bruger med e-mail, og vælg den første rolle.",
        control: { kind: "fields", values: ["E-mail", "Rolle"] },
      },
      {
        title: "Rettigheder",
        description: "Slå hver handling til eller fra for Administrator, Manager, Medlem eller en tilpasset rolle.",
        control: { kind: "permissions", value: "Handlinger pr. rolle" },
      },
      {
        title: "Datavisning",
        description: "Vælg detaljer, kun totaler eller anonymiserede data for hver rolle.",
        control: { kind: "select", value: "Detaljer, totaler eller anonym" },
      },
      {
        title: "Lokationsadgang",
        description: "Giv adgang til alle eller udvalgte lokationer og operatører.",
        control: { kind: "permissions", value: "Lokationer og operatører" },
      },
      {
        title: "Kiosk",
        description: "Vælg tilladte sider, startside, inaktivitet og en fast Lokation for hver kioskkonto.",
        control: { kind: "fields", values: ["Sider", "Startside", "Lokation"] },
      },
    ],
  },
];

export function findHelpFeature(slug: string) {
  return helpFeatures.find((feature) => feature.slug === slug);
}
