import { SharedDashboard } from "@/components/dashboard/shared-dashboard";

export default async function SharedDashboardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SharedDashboard token={token} />;
}
