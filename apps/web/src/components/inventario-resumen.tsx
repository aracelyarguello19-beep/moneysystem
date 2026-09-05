"use client";

import Decimal from "decimal.js";
import type { Item } from "@repo/domain";
import { calcularGananciaProducto } from "@repo/domain";
import { StatCard } from "@/components/ui/stat-card";
import { Icon } from "@/components/ui/icon";
import { formatearMonto } from "@/lib/moneda";

const UMBRAL_STOCK_BAJO = 5;

// KPIs de Inventario — mismo bento de 4 tarjetas que "Inventario y
// Rentabilidad Detallada" (Stitch): valorización de stock, margen promedio,
// artículos activos y alertas de reposición (stock > 0 y <= umbral, o
// agotado). Puramente presentacional: `items`/`valorInventario` vienen ya
// cargados de InventarioPage (una sola transacción para toda la página, ver
// obtener-inventario.ts) — antes este componente pedía sus propios datos
// por separado, duplicando la lectura de `items` que ItemCatalogo también pedía.
export function InventarioResumen({
  items,
  valorInventario,
}: {
  items: Item[];
  valorInventario: string;
}) {
  const alertas = items.filter((i) => Number(i.stockActual) <= UMBRAL_STOCK_BAJO);

  const margenes = items
    .filter((i) => i.costoCompra && Number(i.precioVenta) > 0)
    .map((i) => Number(calcularGananciaProducto(i.precioVenta, i.costoCompra ?? "0").margen));
  const margenPromedio =
    margenes.length > 0 ? new Decimal(margenes.reduce((a, b) => a + b, 0)).dividedBy(margenes.length) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Icon name="account_balance" />}
          tone="primary"
          label="Valorización de stock"
          value={formatearMonto(valorInventario)}
        />
        <StatCard
          icon={<Icon name="pie_chart" />}
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
