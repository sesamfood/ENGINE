import { fetchAction } from "convex/nextjs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { InvitationCard } from "@/components/auth/invitation-card";
import { buttonVariants } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ invitationId: string }>;
}) {
  const { invitationId } = await params;
  const linkStatus = await fetchAction(api.invitations.getLinkStatus, {
    invitationId,
  });

  if (linkStatus.status === "unavailable") {
    redirect("/login");
  }

  if (linkStatus.status === "expired") {
    return (
      <AuthCard
        title="Invitationen er udløbet"
        description="Bed en bruger med rollen Administrator om at sende en ny invitation."
      >
        <Link href="/login" className={buttonVariants({ size: "lg" })}>
          Gå til login
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Invitation"
      description={
        linkStatus.hasAccount
          ? `Log ind med ${linkStatus.email} for at acceptere invitationen.`
          : `Opret en konto med ${linkStatus.email} for at acceptere invitationen.`
      }
    >
      <InvitationCard
        invitationId={invitationId}
        email={linkStatus.email}
        hasAccount={linkStatus.hasAccount}
      />
    </AuthCard>
  );
}
