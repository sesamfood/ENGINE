"use client";

import { CircleQuestionMarkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function HelpTooltip({
  content,
  label,
}: {
  content: string;
  label: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        closeOnClick={false}
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Hjælp til ${label}`}
          />
        }
      >
        <CircleQuestionMarkIcon />
      </TooltipTrigger>
      <TooltipContent>{content}</TooltipContent>
    </Tooltip>
  );
}
