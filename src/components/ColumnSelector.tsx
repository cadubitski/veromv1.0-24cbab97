import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SlidersHorizontal } from "lucide-react";

export interface ColumnDef {
  key: string;
  label: string;
  defaultVisible?: boolean;
}

interface Props {
  columns: ColumnDef[];
  visible: Set<string>;
  onChange: (visible: Set<string>) => void;
}

export default function ColumnSelector({ columns, visible, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (key: string) => {
    const next = new Set(visible);
    if (next.has(key)) {
      if (next.size === 1) return; // keep at least one
      next.delete(key);
    } else {
      next.add(key);
    }
    onChange(next);
  };

  return (
    <div className="relative" ref={ref}>
      <Button variant="outline" size="sm" className="gap-2 h-9" onClick={() => setOpen((o) => !o)}>
        <SlidersHorizontal className="h-4 w-4" />
        Colunas
      </Button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 min-w-[180px] rounded-md border border-border bg-popover shadow-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Colunas visíveis</p>
          {columns.map((col) => (
            <label key={col.key} className="flex items-center gap-2 cursor-pointer text-sm hover:text-foreground transition-colors">
              <Checkbox
                checked={visible.has(col.key)}
                onCheckedChange={() => toggle(col.key)}
              />
              {col.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
