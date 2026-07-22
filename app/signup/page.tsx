import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";

function safeRedirect(value?: string) {
  return value?.startsWith("/") && !value.startsWith("//")
    ? value
    : "/onboarding";
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthCard
      title="Opret konto"
      description="Opret din konto. Du skal bekræfte din e-mail, før du kan logge ind."
    >
      <SignupForm redirectTo={safeRedirect(params.redirect)} />
    </AuthCard>
  );
}
