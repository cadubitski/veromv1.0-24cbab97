import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface InfoTooltipProps {
  text: string;
}

export function InfoTooltip({ text }: InfoTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help text-muted-foreground hover:text-foreground transition-colors">
          <Info className="h-3.5 w-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px] text-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

interface FieldLabelProps {
  label: string;
  tooltip: string;
  required?: boolean;
}

export function FieldLabel({ label, tooltip, required }: FieldLabelProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm font-medium leading-none">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </span>
      <InfoTooltip text={tooltip} />
    </div>
  );
}
