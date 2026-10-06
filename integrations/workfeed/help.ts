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
      title: "Forbind Workfeed",
      steps: [
        "Få CompanyID og API-nøgle fra Workfeed.",
        "Åbn Administration → Integrationer → Workfeed, og aktivér integrationen. Det kræver adgang til alle lokationer.",
        "Udfyld CompanyID og API-nøgle, og vælg Forbind Workfeed. Beskeden viser, hvor mange afdelinger der er fundet.",
      ],
    },
    {
      id: "afdelinger",
      title: "Kobl lokationer til afdelinger",
      steps: [
        "Åbn Lokationer og afdelinger.",
        "Vælg den Workfeed-afdeling, der har lokationens vagtplan. Valget gemmes og starter en synkronisering.",
        "Brug Opdatér afdelinger, hvis en ny afdeling mangler.",
      ],
      bullets: [
        "En afdeling kan kun kobles til én Lokation.",
      ],
    },
    {
      id: "kontroller-data",
      title: "Medarbejdere og vagter",
      bullets: [
        "Synkroniseringen kører dagligt og henter medarbejdere og offentliggjorte vagter fra 30 dage tilbage til 60 dage frem. Kladder hentes ikke.",
        "Synkronisér nu på Medarbejdere henter med det samme.",
        "Vagterne bruges i Vagtplan, Staff food og Dashboard. Workfeed-medarbejdere er ikke Brugere og får ikke login.",
        "Fejler forbindelsen, vises de senest hentede data med en advarsel.",
      ],
    },
    {
      id: "vedligeholdelse",
      title: "Opdatér eller fjern",
      bullets: [
        "Indtast en ny API-nøgle, og vælg Opdatér forbindelse for at udskifte nøglen.",
        "Skift af CompanyID sletter afdelingskoblingerne.",
        "Fjern kobling stopper én Lokations kobling. Fjern forbindelse sletter API-nøglen og alle koblinger. Hentede medarbejdere bevares, men opdateres ikke.",
      ],
    },
  ],
  troubleshooting: [
    {
      question: "Vagtplanen er tom",
      answer:
        "Kontrollér Lokation, uge og afdelingskobling, og at vagterne er offentliggjort i Workfeed. Vælg derefter Synkronisér nu.",
    },
    {
      question: "Synkronisér nu mangler eller er låst",
      answer:
        "Integrationen skal være aktiv. Knappen er låst under en synkronisering og vises ikke i kiosktilstand.",
    },
  ],
  relatedLinks: [
    { href: "/help/medarbejdere/overblik", label: "Medarbejdere og vagtplan" },
  ],
};
