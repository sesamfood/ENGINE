import type { HelpGuide } from "@/components/help/help-types";

export const workfeedGuide: HelpGuide = {
  integration: "workfeed",
  slug: "workfeed",
  label: "Workfeed",
  summary:
    "Forbind Workfeed, kobl afdelinger til lokationer, og hent medarbejdere og offentliggjorte vagter.",
  appHref: "/administration/integrations/workfeed",
  appLinkLabel: "Åbn Workfeed-indstillinger",
  sections: [
    {
      id: "forbind",
      title: "Forbind jeres Workfeed-konto",
      steps: [
        "Hav Workfeed CompanyID og API-nøgle klar. Kontakt Workfeed, hvis I mangler oplysningerne eller API-adgang.",
        "Åbn Administration → Integrationer → Workfeed, og aktivér integrationen, og åbn dens indstillinger. Udfyld CompanyID og API-nøgle, og vælg Forbind Workfeed.",
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
        "Deaktivér integrationen for at stoppe automatiske opdateringer. De senest synkroniserede medarbejderdata bevares.",
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
