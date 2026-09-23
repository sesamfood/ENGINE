import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MetricResult } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";
import { formatMetricValue } from "./utils";

export function TableVisualization({ result, compact = false }: { result: MetricResult; compact?: boolean }) {
  const rows = result.breakdown ?? result.series.map((series) => ({ key: series.key, label: series.label, value: series.total }));
  return (
    <div className="@container h-full min-h-0 overflow-auto">
      <Table appearance={compact ? "compactWidget" : "widget"} className="w-full table-auto">
        <TableHeader className={cn(compact && "sr-only")}>
          <TableRow>
            <TableHead>Navn</TableHead>
            <TableHead className="w-px text-right">Værdi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.slice(0, 20).map((row) => (
            <TableRow key={row.key}>
              <TableCell title={row.label} appearance={compact ? "compactLabelWrap" : "labelTruncate"} className="max-w-0">{row.label}</TableCell>
              <TableCell appearance={compact ? "compactNumeric" : "numeric"} className="w-px text-right whitespace-nowrap">{formatMetricValue(row.value, result)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length > 20 ? <p role="status" className="py-1 text-xs text-muted-foreground">Viser 20 af {rows.length} grupper.</p> : null}
    </div>
  );
}
