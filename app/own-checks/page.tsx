import { TodayOwnChecks } from "@/components/own-checks/today-own-checks";

export default async function OwnChecksPage({ searchParams }: {
  searchParams: Promise<{ locationId?: string | string[] }>;
}) {
  const { locationId } = await searchParams;
  return <TodayOwnChecks initialLocationId={typeof locationId === "string" ? locationId : undefined} />;
}
