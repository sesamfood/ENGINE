import Image from "next/image";
import type { ReactNode } from "react";
import { AlertTriangleIcon, CheckCircle2Icon, FileIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  evaluateCompliance,
  formatValue,
  ownCheckStatusLabels,
  type OwnCheckField,
  type OwnCheckStatus,
  type OwnCheckValue,
} from "@/lib/own-checks";
import { ownCheckLimitText } from "@/lib/own-check-display";

export function OwnCheckStatusBadge({ status }: { status: OwnCheckStatus }) {
  const variant =
    status === "deviation"
      ? "destructive"
      : status === "approved"
        ? "default"
        : status === "notCompleted"
          ? "outline"
          : "secondary";
  return (
    <Badge variant={variant}>
      {status === "approved" ? (
        <CheckCircle2Icon data-icon="inline-start" />
      ) : status === "deviation" ? (
        <AlertTriangleIcon data-icon="inline-start" />
      ) : null}
      {ownCheckStatusLabels[status]}
    </Badge>
  );
}

export function OwnCheckResultFields({
  fields,
  values,
  renderAttachments,
}: {
  fields: OwnCheckField[];
  values: OwnCheckValue[];
  renderAttachments?: (fieldKey: string) => ReactNode;
}) {
  const valueMap = new Map(values.map((value) => [value.key, value]));
  const violations = new Map(
    evaluateCompliance(fields, values).violations.map((violation) => [
      violation.key,
      violation,
    ]),
  );
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Felt</TableHead>
            <TableHead>Værdi</TableHead>
            <TableHead>Grænse</TableHead>
            <TableHead>Vurdering</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fields.map((field) => {
            const violation = violations.get(field.key);
            return (
              <TableRow key={field.key}>
                <TableCell className="font-medium">{field.label}</TableCell>
                <TableCell>
                  <div>{formatValue(field, valueMap.get(field.key))}</div>
                  {field.type === "attachment"
                    ? renderAttachments?.(field.key)
                    : null}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {ownCheckLimitText(field)}
                </TableCell>
                <TableCell>
                  {violation ? (
                    <span className="text-sm text-destructive">
                      {violation.message}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      Inden for grænsen
                    </span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

type Attachment = {
  id: string;
  fieldKey: string;
  contentType: string;
  url: string | null;
  addedAtRevision: number;
  removedAtRevision: number | null;
};

export function OwnCheckAttachments({
  attachments,
  fieldKey,
  revision,
}: {
  attachments: Attachment[];
  fieldKey: string;
  revision: number;
}) {
  const visible = attachments.filter(
    (attachment) =>
      attachment.fieldKey === fieldKey &&
      attachment.addedAtRevision <= revision &&
      (attachment.removedAtRevision === null ||
        attachment.removedAtRevision > revision),
  );
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {visible.map((attachment, index) =>
        attachment.url ? (
          <a
            key={attachment.id}
            href={attachment.url}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-20 w-28 flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border bg-muted/30 text-xs focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {attachment.contentType.startsWith("image/") ? (
              <Image
                src={attachment.url}
                alt={`Dokumentation ${index + 1}`}
                width={112}
                height={56}
                unoptimized
                className="h-14 w-full object-cover"
              />
            ) : (
              <FileIcon className="size-8 text-muted-foreground" />
            )}
            <span>
              {attachment.contentType.startsWith("image/")
                ? "Åbn billede"
                : "Åbn PDF"}
            </span>
          </a>
        ) : null,
      )}
    </div>
  );
}
