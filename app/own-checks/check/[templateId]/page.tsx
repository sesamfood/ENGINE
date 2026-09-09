import { notFound } from "next/navigation";
import { OwnCheckDetail } from "@/components/own-checks/own-check-detail";
import { addDateKey } from "@/lib/own-checks";

export default async function OwnCheckPage({ params, searchParams }: {
  params: Promise<{ templateId: string }>;
  searchParams: Promise<{ locationId?: string | string[]; date?: string | string[] }>;
}) {
  const { templateId } = await params;
  const { locationId, date } = await searchParams;
  if (typeof locationId !== "string" || typeof date !== "string") notFound();
  try {
    addDateKey(date, 0);
  } catch {
    notFound();
  }
  return <OwnCheckDetail templateId={templateId} locationId={locationId} dateKey={date} />;
}
