import type { CuentaPorCobrar, Item } from "@repo/domain";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { formatearMonto } from "@/lib/moneda";

const UMBRAL_STOCK_BAJO = 5;
const MAX_FILAS = 4;

// "Alertas Críticas" del Dashboard — mismo patrón que "Dashboard Operativo
// Centralizado" de Stitch: stock bajo + cuentas por cobrar pendientes. La
// maqueta original usa "Facturas Vencidas" (por fecha de vencimiento), pero
// `CuentaPorCobrar` no tiene ese campo en el dominio — se adapta a
// "Pendientes de cobro" (PENDIENTE/PARCIAL) para no inventar un dato que no
// existe. [Article IV — No Invention] Recibe los datos ya resueltos por
// `obtenerDashboard` en vez de pedirlos por su cuenta.
export function AlertasCriticas({
  items,
  cuentasPorCobrar,
}: {
  items: Item[];
  cuentasPorCobrar: (CuentaPorCobrar & { fechaOrigen: Date })[];
}) {
  const stockBajo = items.filter((i) => i.tipo === "PRODUCTO" && Number(i.stockActual) <= UMBRAL_STOCK_BAJO);
  const pendientes = cuentasPorCobrar.filter((c) => c.estado !== "PAGADO");

  return (
    <Card className="flex flex-1 flex-col">
      <div className="mb-4 flex items-center gap-2 border-b border-outline-variant pb-3">
        <Icon name="warning" className="text-warning" />
        <h3 className="text-headline-sm font-semibold text-on-surface">Alertas Críticas</h3>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <h4 className="mb-2 text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">
            Stock bajo
          </h4>
          {stockBajo.length === 0 ? (
            <p className="text-body-md text-on-surface-variant">Sin alertas de stock.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {stockBajo.slice(0, MAX_FILAS).map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between rounded border border-outline-variant bg-surface-container-lowest p-2"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-surface-container text-on-surface-variant">
                      <Icon name="inventory_2" className="text-[18px]" />
                    </div>
                    <span className="text-body-md font-medium text-on-surface">{item.nombre}</span>
                  </div>
                  <span className="rounded bg-warning/10 px-2 py-0.5 text-[11px] font-bold text-warning">
                    Quedan {item.stockActual}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="pt-2">
          <h4 className="mb-2 text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">
            Pendientes de cobro
          </h4>
          {pendientes.length === 0 ? (
            <p className="text-body-md text-on-surface-variant">Sin cuentas por cobrar pendientes.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {pendientes.slice(0, MAX_FILAS).map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded border-l-2 border-l-error border-y border-r border-outline-variant bg-surface-container-lowest p-2"
                >
                  <div className="flex flex-col">
                    <span className="text-body-md font-medium text-on-surface">{c.cliente}</span>
                    <span className="text-label-md text-on-surface-variant">
                      {c.fechaOrigen.toISOString().slice(0, 10)}
                    </span>
                  </div>
                  <span className="text-label-lg font-semibold text-error">
                    {formatearMonto((Number(c.montoOriginal) - Number(c.montoPagado)).toString())}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
