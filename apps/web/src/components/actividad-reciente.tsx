import type { MovimientoCajaListado } from "@/actions/indicadores/obtener-dashboard";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

const MAX_FILAS = 4;

const CONFIG_REFERENCIA: Record<string, { etiqueta: string; icon: string; tono: "success" | "secondary" | "error" }> = {
  VENTA: { etiqueta: "Venta completada", icon: "add_shopping_cart", tono: "success" },
  COMPRA: { etiqueta: "Compra de stock", icon: "local_shipping", tono: "secondary" },
  GASTO: { etiqueta: "Gasto registrado", icon: "payments", tono: "error" },
  PAGO_CXC: { etiqueta: "Cobro recibido", icon: "payments", tono: "success" },
  MANUAL: { etiqueta: "Movimiento manual", icon: "sync_alt", tono: "secondary" },
};

const TONO_CLASES: Record<string, string> = {
  success: "bg-success/10 text-success",
  secondary: "bg-secondary-container text-on-secondary-container",
  error: "bg-error/10 text-error",
};

// "Actividad Reciente" del Dashboard — mismo patrón de timeline que
// "Dashboard Operativo Centralizado" de Stitch, alimentado con datos reales
// que ya resolvió `obtenerDashboard` (mismo feed que Caja) en vez de un
// listado inventado o de una llamada propia al servidor.
export function ActividadReciente({ movimientos }: { movimientos: MovimientoCajaListado[] }) {
  return (
    <Card className="flex flex-1 flex-col">
      <div className="mb-4 flex items-center gap-2 border-b border-outline-variant pb-3">
        <Icon name="history" className="text-tertiary" />
        <h3 className="text-headline-sm font-semibold text-on-surface">Actividad Reciente</h3>
      </div>

      {movimientos.length === 0 ? (
        <p className="text-body-md text-on-surface-variant">Todavía no hay movimientos registrados.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {movimientos.slice(0, MAX_FILAS).map((m) => {
            const config = CONFIG_REFERENCIA[m.referenciaTipo ?? "MANUAL"] ?? CONFIG_REFERENCIA.MANUAL;
            return (
              <li key={m.id} className="flex gap-3">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${TONO_CLASES[config.tono]}`}
                >
                  <Icon name={config.icon} className="text-[18px]" />
                </div>
                <div>
                  <p className="text-body-md text-on-surface">
                    <span className="font-semibold">{config.etiqueta}</span> — {m.cuentaNombre}
                  </p>
                  <p className="text-label-md text-on-surface-variant">
                    {m.fecha.toString().slice(0, 10)} · {m.tipo === "INGRESO" ? "+" : "-"}
                    {m.monto} {m.monedaCodigo}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
