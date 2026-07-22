import { AuthCard } from "@/components/auth/auth-card";
import { OnboardingForm } from "@/components/auth/onboarding-form";

export default function OnboardingPage() {
  return (
    <AuthCard
      title="Vælg organisation"
      description="Opret en ny organisation, eller tilmeld dig en eksisterende med din invitationskode."
    >
      <OnboardingForm />
    </AuthCard>
  );
}
