"use client";

import { useConvex } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { dateTimeFormatter } from "@/lib/date";
import { getUserErrorMessage } from "@/lib/user-errors";
import {
  OwnCheckAttachments,
  OwnCheckExecutionTimes,
  OwnCheckProductTemperatures,
} from "./own-check-results";

type RecordResult = NonNullable<
  FunctionReturnType<typeof api.ownChecks.getOwnCheckRecord>
>;
const revisionKindLabels = {
  submitted: "Oprindelig registrering",
  edited: "Rettelse",
  deviationRecorded: "Afvigelse registreret",
  correctiveActionRecorded: "Korrigerende handling",
  approved: "Godkendelse",
} as const;

export function OwnCheckHistory({ record }: { record: RecordResult }) {
  const convex = useConvex();
  const [revisions, setRevisions] = useState(record.revisions);
  const [attachments, setAttachments] = useState(record.attachments);
  const [nextRevision, setNextRevision] = useState(record.historyNextRevision);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    if (loading || nextRevision === null) return;
    setLoading(true);
    try {
      const page = await convex.query(api.ownChecks.listOwnCheckHistory, {
        entryId: record.entry.id,
        afterRevision: nextRevision,
      });
      setRevisions((current) => [
        ...new Map(
          [...current, ...page.revisions].map((revision) => [
            revision.id,
            revision,
          ]),
        ).values(),
      ]);
      setAttachments((current) => [
        ...new Map(
          [...current, ...page.attachments].map((attachment) => [
            attachment.id,
            attachment,
          ]),
        ).values(),
      ]);
      setNextRevision(page.nextRevision);
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "Historikken kunne ikke hentes. Prøv igen."),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ændringshistorik</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {revisions.map((revision, index) => (
          <div
            key={revision.id}
            className="relative pl-5 before:absolute before:top-1 before:bottom-0 before:left-1 before:w-px before:bg-border last:before:bottom-auto last:before:h-1"
          >
            <div className="absolute top-1 left-0 size-2 rounded-full bg-primary" />
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  Revision {revision.revision}
                </span>
                <Badge variant={index === 0 ? "secondary" : "outline"}>
                  {revisionKindLabels[revision.kind]}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {dateTimeFormatter("da-DK", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: record.timeZone,
                  }).format(revision.at)}{" "}
                  · {revision.actorName}
                </span>
              </div>
              {revision.reason ? (
                <p className="text-sm text-muted-foreground">
                  Begrundelse: {revision.reason}
                </p>
              ) : null}
              {revision.startedAt !== null || revision.endedAt !== null ? (
                <OwnCheckExecutionTimes
                  startedAt={revision.startedAt}
                  endedAt={revision.endedAt}
                  timeZone={record.timeZone}
                />
              ) : null}
              <OwnCheckProductTemperatures
                productTemperatures={revision.productTemperatures}
              />
              {revision.changes.length ? (
                <ul className="flex flex-col gap-1 text-sm">
                  {revision.changes.map((change) => (
                    <li key={`${revision.id}-${change.field}`}>
                      <span className="font-medium">{change.label}:</span>{" "}
                      {change.from ?? "—"} → {change.to ?? "—"}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {record.fields
                  .filter((field) => field.type === "attachment")
                  .map((field) => (
                    <OwnCheckAttachments
                      key={field.key}
                      attachments={attachments}
                      fieldKey={field.key}
                      revision={revision.revision}
                    />
                  ))}
              </div>
            </div>
          </div>
        ))}
        {nextRevision !== null ? (
          <Button
            type="button"
            variant="outline"
            className="self-start"
            disabled={loading}
            onClick={() => void loadMore()}
          >
            {loading ? <Spinner data-icon="inline-start" /> : null}Vis flere
            revisioner
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
