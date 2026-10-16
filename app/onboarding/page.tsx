import { fetchQuery } from "convex/nextjs";
import { AuthCard } from "@/components/auth/auth-card";
import { OnboardingForm } from "@/components/auth/onboarding-form";
import { api } from "@/convex/_generated/api";

export default async function OnboardingPage() {
  const canCreate = await fetchQuery(api.organization.canCreateOrganization);
  return (
    <AuthCard
      title="Vælg organisation"
      description={
        canCreate
          ? "Opret en ny organisation, eller tilmeld dig en eksisterende med din invitationskode."
          : "Tilmeld dig en organisation med din invitationskode."
      }
    >
      <OnboardingForm canCreate={canCreate} />
    </AuthCard>
  );
}
