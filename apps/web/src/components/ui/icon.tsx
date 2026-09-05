import { cn } from "@/lib/utils";

// Material Symbols — `name` es el nombre del ícono tal cual lo usa Google
// Fonts (ej. "dashboard", "payments", "warning"), ver
// https://fonts.google.com/icons. Outline (trazo fino) por defecto: el
// dashboard de Ticto (design system de referencia, ver
// outputs/design-extractor/ticto-dashboard/DESIGN.md#Iconography) tiene un
// look visual uniforme de línea delgada — incluso los íconos ahí que
// técnicamente son `fill` sólido (no `stroke` de SVG) dibujan una silueta de
// trazo fino, nunca un glifo macizo. El relleno (FILL 1, look "material
// filled") queda como acento puntual para estados activos/seleccionados,
// pasando `fill={true}` explícito caso por caso (ver `caja-panel.tsx`,
// `app-sidebar.tsx`, `producto-libre-buscador.tsx`).
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
      style={fill ? { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" } : undefined}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
