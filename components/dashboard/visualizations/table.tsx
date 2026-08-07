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
    <div className="h-full min-h-0 overflow-auto">
      <Table className={cn(compact && "text-xs")}>
        <TableHeader className={cn(compact && "sr-only")}>
          <TableRow>
            <TableHead>Navn</TableHead>
            <TableHead className="text-right">Værdi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.slice(0, 20).map((row) => (
            <TableRow key={row.key}>
              <TableCell className={cn("font-medium", compact && "py-1.5")}>{row.label}</TableCell>
              <TableCell className={cn("text-right tabular-nums", compact && "py-1.5")}>{formatMetricValue(row.value, result.unit)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
