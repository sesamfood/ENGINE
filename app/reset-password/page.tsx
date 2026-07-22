import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthCard
      title="Vælg ny adgangskode"
      description="Den nye adgangskode logger dig ud af dine øvrige sessioner."
    >
      <ResetPasswordForm
        token={params.token}
        invalid={params.error === "INVALID_TOKEN"}
      />
    </AuthCard>
  );
}
