import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";

// Ícono coloreado por tono, sin tile de fondo — mismo tratamiento que las
// stat cards de Ticto (Ventas/Boletos/Reembolsos, ver
// outputs/design-extractor/ticto-dashboard/DESIGN.md): un ícono de línea
// fina, en el color semántico, en línea con el label, no un badge grande.
const iconToneVariants = cva("shrink-0 text-[20px]", {
  variants: {
    tone: {
      primary: "text-primary",
      danger: "text-error",
      warning: "text-warning",
      neutral: "text-on-surface-variant",
    },
  },
  defaultVariants: { tone: "neutral" },
});

const deltaVariants = cva("inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold", {
  variants: {
    tone: {
      primary: "bg-success/10 text-success",
      danger: "bg-error/10 text-error",
      warning: "bg-warning/10 text-warning",
      neutral: "bg-surface-container text-on-surface-variant",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export interface StatCardProps extends VariantProps<typeof iconToneVariants> {
  icon?: ReactNode;
  label: string;
  value: string;
  /** Texto chico bajo el valor — ej. "El mes pasado: Gs. 0" (patrón Ticto). */
  caption?: string;
  /** ej: "+11.8%" — el signo elige la flecha (trending_up/trending_down) */
  delta?: string;
  /** Card "spotlight": relleno sólido, para el KPI principal (patrón "Ganancia Líquida" / "Producto Estrella") */
  spotlight?: boolean;
  className?: string;
}

// Header [ícono + label] ... [delta] en una sola fila, valor grande debajo,
// caption opcional chica debajo del valor — mismo orden de lectura que las
// stat cards del dashboard de Ticto (design system de referencia).
export function StatCard({
  icon,
  label,
  value,
  caption,
  delta,
  tone = "neutral",
  spotlight = false,
  className,
}: StatCardProps) {
  const deltaPositive = delta?.trim().startsWith("+");

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-5",
        spotlight
          ? "border-transparent bg-primary text-on-primary"
          : "border-outline-variant bg-surface-container-lowest",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon && (
            <span className={cn(iconToneVariants({ tone }), spotlight && "text-on-primary")}>{icon}</span>
          )}
          <span
            className={cn(
              "text-label-lg font-semibold",
              spotlight ? "text-on-primary" : "text-on-surface-variant",
            )}
          >
            {label}
          </span>
        </div>
        {delta && (
          <span
            className={cn(
              deltaVariants({ tone: spotlight ? "neutral" : tone }),
              spotlight && "bg-on-primary/10 text-on-primary",
            )}
          >
            <Icon name={deltaPositive ? "trending_up" : "trending_down"} className="text-[14px]" /> {delta}
          </span>
        )}
      </div>
      <div>
        <p className={cn("text-headline-md font-bold", spotlight ? "text-on-primary" : "text-on-surface")}>
          {value}
        </p>
        {caption && (
          <p className={cn("mt-1 text-label-md", spotlight ? "text-on-primary/70" : "text-on-surface-variant")}>
            {caption}
          </p>
        )}
      </div>
    </div>
  );
}
