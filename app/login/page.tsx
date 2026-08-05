import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";

function safeRedirect(value?: string) {
  return value?.startsWith("/") && !value.startsWith("//")
    ? value
    : "/onboarding";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    redirect?: string;
    verified?: string;
    reset?: string;
    deleted?: string;
  }>;
}) {
  const params = await searchParams;

  return (
    <AuthCard
      title="Log ind"
      description="Brug din e-mail eller dit brugernavn og adgangskode for at fortsætte."
    >
      <LoginForm
        redirectTo={safeRedirect(params.redirect)}
        verified={params.verified === "1"}
        reset={params.reset === "1"}
        deleted={params.deleted === "1"}
      />
    </AuthCard>
  );
}
