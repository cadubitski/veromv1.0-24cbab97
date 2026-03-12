import { Settings2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

// ─── StatusDot ────────────────────────────────────────────────────────────────

export interface StatusDotConfig {
  color: string;      // Tailwind bg-* class e.g. "bg-emerald-500"
  label: string;      // Human label e.g. "Ativo"
}

const STATUS_DOT_MAP: Record<string, StatusDotConfig> = {
  // generic
  ativo:      { color: "bg-emerald-500", label: "Ativo" },
  inativo:    { color: "bg-zinc-400",    label: "Inativo" },
  // contracts
  encerrado:  { color: "bg-zinc-400",    label: "Encerrado" },
  cancelado:  { color: "bg-rose-500",    label: "Cancelado" },
  // properties
  disponivel: { color: "bg-emerald-500", label: "Disponível" },
  alugado:    { color: "bg-blue-500",    label: "Alugado" },
  vendido:    { color: "bg-violet-500",  label: "Vendido" },
  // installments
  em_aberto:  { color: "bg-amber-400",   label: "Em aberto" },
  pago:       { color: "bg-emerald-500", label: "Pago" },
  atrasado:   { color: "bg-rose-500",    label: "Atrasado" },
  // accounts receivable
  pending:    { color: "bg-amber-400",   label: "Pendente" },
  paid:       { color: "bg-emerald-500", label: "Recebido" },
  cancelled:  { color: "bg-rose-500",    label: "Cancelado" },
};

interface StatusDotProps {
  status: string;
  custom?: StatusDotConfig;
}

export function StatusDot({ status, custom }: StatusDotProps) {
  const cfg = custom ?? STATUS_DOT_MAP[status] ?? { color: "bg-zinc-400", label: status };
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${cfg.color}`}
      title={cfg.label}
      aria-label={cfg.label}
    />
  );
}

// ─── StatusLegend items ────────────────────────────────────────────────────────

interface LegendEntry { color: string; label: string; }

// ─── ActionGear ───────────────────────────────────────────────────────────────

export interface ActionItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "destructive";
  disabled?: boolean;
  tooltip?: string;
}

interface ActionGearProps {
  actions: ActionItem[];
  /** Pass the status keys relevant to THIS table so the legend only shows relevant colors */
  legendKeys?: string[];
}

export function ActionGear({ actions, legendKeys }: ActionGearProps) {
  const legendEntries: LegendEntry[] = (legendKeys ?? Object.keys(STATUS_DOT_MAP)).map(
    (k) => STATUS_DOT_MAP[k]
  ).filter(Boolean);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 data-[state=open]:bg-muted"
          title="Ações"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" className="w-48">
        {actions.map((action, idx) => (
          <DropdownMenuItem
            key={idx}
            onClick={action.onClick}
            disabled={action.disabled}
            title={action.tooltip}
            className={
              action.variant === "destructive"
                ? "text-destructive focus:text-destructive focus:bg-destructive/10"
                : undefined
            }
          >
            {action.icon && <span className="mr-2 h-4 w-4 flex items-center">{action.icon}</span>}
            {action.label}
          </DropdownMenuItem>
        ))}

        {legendEntries.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal pb-1">
              Legenda de status
            </DropdownMenuLabel>
            {legendEntries.map((e, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1">
                <span className={`inline-block h-2 w-2 rounded-full ${e.color} shrink-0`} />
                <span className="text-xs text-muted-foreground">{e.label}</span>
              </div>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
