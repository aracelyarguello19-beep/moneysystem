"use client";

import { useEffect, useState } from "react";
import Decimal from "decimal.js";
import type { Item } from "@repo/domain";
import { calcularGananciaProducto } from "@repo/domain";
import { listarItems } from "@/actions/inventario/listar-items";
import { obtenerValorInventario } from "@/actions/inventario/obtener-valor-inventario";
import { StatCard } from "@/components/ui/stat-card";
import { Icon } from "@/components/ui/icon";
import { useInventarioCambiado } from "@/lib/inventario-events";

const UMBRAL_STOCK_BAJO = 5;

// KPIs de Inventario — mismo bento de 4 tarjetas que "Inventario y
// Rentabilidad Detallada" (Stitch): valorización de stock, margen promedio,
// artículos activos y alertas de reposición (stock > 0 y <= umbral, o
// agotado).
export function InventarioResumen({ negocioId }: { negocioId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [valorTotal, setValorTotal] = useState<string>("0");
  const [alertaCerrada, setAlertaCerrada] = useState(false);

  async function cargar() {
    const [itemsResult, valorResult] = await Promise.all([
      listarItems(negocioId),
      obtenerValorInventario(negocioId),
    ]);
    if (itemsResult.ok) setItems(itemsResult.data.filter((i) => i.tipo === "PRODUCTO"));
    if (valorResult.ok) setValorTotal(valorResult.data.total);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [negocioId]);

  useInventarioCambiado(cargar);

  const alertas = items.filter((i) => Number(i.stockActual) <= UMBRAL_STOCK_BAJO);

  const margenes = items
    .filter((i) => i.costoCompra && Number(i.precioVenta) > 0)
    .map((i) => Number(calcularGananciaProducto(i.precioVenta, i.costoCompra ?? "0").margen));
  const margenPromedio =
    margenes.length > 0 ? new Decimal(margenes.reduce((a, b) => a + b, 0)).dividedBy(margenes.length) : null;

  return (
    <div className="flex flex-col gap-4">
      {alertas.length > 0 && !alertaCerrada && (
        <div className="flex items-start gap-3 rounded border border-error/30 bg-error-container p-4">
          <Icon name="warning" className="text-on-error-container" />
          <div className="flex-1">
            <p className="text-label-lg font-semibold text-on-error-container">
              Acción requerida: reposición de inventario
            </p>
            <p className="text-body-md text-on-error-container/90">
              Hay {alertas.length} artículo{alertas.length === 1 ? "" : "s"} por debajo o en el nivel mínimo de
              stock. Se recomienda registrar una compra para evitar quedarte sin stock.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAlertaCerrada(true)}
            className="rounded p-1.5 text-on-error-container transition-colors hover:bg-error/10"
            aria-label="Cerrar alerta"
          >
            <Icon name="close" className="text-[18px]" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Icon name="account_balance" />}
          tone="primary"
          label="Valorización de stock"
          value={valorTotal}
        />
        <StatCard
          icon={<Icon name="percent" />}
          tone="neutral"
          label="Margen promedio"
          value={margenPromedio ? `${margenPromedio.toFixed(1)}%` : "—"}
        />
        <StatCard
          icon={<Icon name="category" />}
          tone="neutral"
          label="Artículos activos"
          value={items.length.toString()}
        />
        <StatCard
          icon={<Icon name="inventory" />}
          tone={alertas.length > 0 ? "danger" : "neutral"}
          label="Alertas de reposición"
          value={alertas.length.toString()}
        />
      </div>
    </div>
  );
}
