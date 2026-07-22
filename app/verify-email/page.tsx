import { AuthCard } from "@/components/auth/auth-card";
import { VerifyEmailNotice } from "@/components/auth/verify-email-notice";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; redirect?: string }>;
}) {
  const { email, redirect = "/onboarding" } = await searchParams;
  const redirectTo =
    redirect.startsWith("/") && !redirect.startsWith("//")
      ? redirect
      : "/onboarding";

  return (
    <AuthCard
      title="Tjek din indbakke"
      description={
        email
          ? `Vi har sendt et bekræftelseslink til ${email}.`
          : "Vi har sendt dig et bekræftelseslink."
      }
    >
      <VerifyEmailNotice email={email} redirectTo={redirectTo} />
    </AuthCard>
  );
}
