import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const iconBadgeVariants = cva("flex h-10 w-10 shrink-0 items-center justify-center rounded", {
  variants: {
    tone: {
      primary: "bg-primary-container text-on-primary-container",
      danger: "bg-error-container text-on-error-container",
      warning: "bg-tertiary-fixed text-on-tertiary-fixed",
      neutral: "bg-surface-container-highest text-on-surface",
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

export interface StatCardProps extends VariantProps<typeof iconBadgeVariants> {
  icon?: ReactNode;
  label: string;
  value: string;
  /** ej: "+11.8%" — el signo elige la flecha (trending_up/trending_down) */
  delta?: string;
  /** Card "spotlight": relleno sólido negro, para el KPI principal (patrón "Ganancia Líquida" / "Producto Estrella" de Stitch) */
  spotlight?: boolean;
  className?: string;
}

export function StatCard({
  icon,
  label,
  value,
  delta,
  tone = "neutral",
  spotlight = false,
  className,
}: StatCardProps) {
  const deltaPositive = delta?.trim().startsWith("+");

  return (
    <div
      className={cn(
        "flex flex-col justify-between gap-4 rounded-lg border p-5 shadow-sm",
        spotlight
          ? "border-transparent bg-primary text-on-primary"
          : "border-outline-variant bg-surface-container-lowest",
        className,
      )}
    >
      <div className="flex items-start justify-between">
        {icon && (
          <span
            className={cn(
              iconBadgeVariants({ tone }),
              spotlight && "bg-on-primary/10 text-on-primary",
            )}
          >
            {icon}
          </span>
        )}
        {delta && (
          <span
            className={cn(
              deltaVariants({ tone: spotlight ? "neutral" : tone }),
              spotlight && "bg-on-primary/10 text-on-primary",
            )}
          >
            {deltaPositive ? "▲" : "▼"} {delta}
          </span>
        )}
      </div>
      <div>
        <p
          className={cn(
            "text-label-md uppercase tracking-wide",
            spotlight ? "text-on-primary/70" : "text-on-surface-variant",
          )}
        >
          {label}
        </p>
        <p className={cn("mt-1 text-headline-md font-bold", spotlight ? "text-on-primary" : "text-on-surface")}>
          {value}
        </p>
      </div>
    </div>
  );
}
