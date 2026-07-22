import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Glemt adgangskode"
      description="Indtast din e-mail, så sender vi et link til at vælge en ny adgangskode."
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
