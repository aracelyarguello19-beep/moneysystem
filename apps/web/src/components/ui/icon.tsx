import { cn } from "@/lib/utils";

// Material Symbols Outlined — el sistema de íconos exacto del design system
// "Fiscal Precision" (Stitch). `name` es el nombre del ícono tal cual lo usa
// Google Fonts (ej. "dashboard", "payments", "warning"), ver
// https://fonts.google.com/icons. `fill` rellena el ícono (estado activo).
export function Icon({
  name,
  className,
  fill = false,
}: {
  name: string;
  className?: string;
  fill?: boolean;
}) {
  return (
    <span
      className={cn("material-symbols-outlined select-none", className)}
      style={fill ? { fontVariationSettings: "'FILL' 1" } : undefined}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
