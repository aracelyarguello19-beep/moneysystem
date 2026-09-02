import type { PuntoTendenciaMensual } from "@/actions/indicadores/obtener-dashboard";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const NOMBRES_MES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

function nombreMes(mes: string): string {
  const [, m] = mes.split("-");
  return NOMBRES_MES[Number(m) - 1] ?? mes;
}

// Barras Ventas (verde) vs Gastos (rojo) de los últimos 6 meses — mismo
// gráfico "Ventas vs Gastos" del Dashboard de Stitch, simulado con divs (sin
// librería de gráficos, igual que el diseño original). Recibe los datos ya
// calculados por `obtenerDashboard` (una sola transacción para todo el
// Dashboard) en vez de pedirlos por su cuenta.
export function VentasVsGastosChart({ puntos }: { puntos: PuntoTendenciaMensual[] }) {
  const max = Math.max(1, ...puntos.flatMap((p) => [Number(p.ventas), Number(p.gastos)]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ventas vs Gastos</CardTitle>
        <CardDescription>Tendencia últimos 6 meses</CardDescription>
      </CardHeader>
      <div className="flex h-64 gap-2 rounded border border-outline-variant bg-surface-container-lowest p-4">
        {puntos.map((p) => (
          <div key={p.mes} className="flex flex-1 flex-col items-center justify-end gap-1">
            <div className="flex w-full flex-1 items-end justify-center gap-1">
              <div
                className="w-3/5 rounded-t bg-success transition-opacity"
                style={{ height: `${Math.max(2, (Number(p.ventas) / max) * 100)}%` }}
              />
              <div
                className="w-3/5 rounded-t bg-error transition-opacity"
                style={{ height: `${Math.max(2, (Number(p.gastos) / max) * 100)}%` }}
              />
            </div>
            <span className="text-label-md text-on-surface-variant">{nombreMes(p.mes)}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-center gap-6">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-success" />
          <span className="text-body-md text-on-surface-variant">Ventas</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-error" />
          <span className="text-body-md text-on-surface-variant">Gastos</span>
        </div>
      </div>
    </Card>
  );
}
