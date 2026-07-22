import { AuthCard } from "@/components/auth/auth-card";
import { InvitationCard } from "@/components/auth/invitation-card";

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ invitationId: string }>;
}) {
  const { invitationId } = await params;

  return (
    <AuthCard
      title="Invitation"
      description="Log ind med den e-mail, invitationen blev sendt til, og accepter medlemskabet."
    >
      <InvitationCard invitationId={invitationId} />
    </AuthCard>
  );
}
