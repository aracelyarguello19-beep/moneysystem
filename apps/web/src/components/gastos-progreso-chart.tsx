import type { GastoResumenTipo } from "@repo/domain";
import { formatearMonto } from "@/lib/moneda";

const COLORES = [
  "bg-primary",
  "bg-secondary",
  "bg-tertiary",
  "bg-warning",
  "bg-outline",
];

// Barras horizontales de gastos por categoría — mismo patrón que "Expenses
// by Category" de Stitch (reportes_operativos_y_ventas): ancho relativo a la
// categoría más alta, no al total, para que el mayor gasto siempre llene la
// barra completa.
export function GastosProgresoChart({ gastos }: { gastos: GastoResumenTipo[] }) {
  if (gastos.length === 0) {
    return <p className="text-sm text-muted">No hay gastos en el período elegido.</p>;
  }

  const max = Math.max(...gastos.map((g) => Number(g.total)));

  return (
    <div className="flex flex-col gap-4">
      {gastos.map((g, i) => (
        <div key={`${g.tipoGastoId}:${g.ambito}`}>
          <div className="mb-1 flex justify-between gap-2 text-body-md">
            <span className="truncate text-on-surface">{g.nombre}</span>
            <span className="shrink-0 font-medium text-on-surface">{formatearMonto(g.total)}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-surface-container">
            <div
              className={`h-2 rounded-full ${COLORES[i % COLORES.length]}`}
              style={{ width: `${max > 0 ? (Number(g.total) / max) * 100 : 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
