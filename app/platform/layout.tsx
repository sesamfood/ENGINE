import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlatformShell } from "@/components/platform/platform-shell";
import { api } from "@/convex/_generated/api";
import { fetchAuthQuery } from "@/lib/auth-server";

export const metadata: Metadata = { title: "Platform" };

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The Convex functions enforce platform access; this only hides the pages.
  const member = await fetchAuthQuery(api.platform.members.me, {}).catch(
    () => null,
  );
  if (!member) notFound();
  return <PlatformShell role={member.role}>{children}</PlatformShell>;
}
