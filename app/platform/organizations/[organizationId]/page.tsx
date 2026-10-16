import { PlatformOrganizationDetail } from "@/components/platform/organization-detail";

export default async function PlatformOrganizationPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  return <PlatformOrganizationDetail organizationId={organizationId} />;
}
