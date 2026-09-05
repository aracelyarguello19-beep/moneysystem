"use server";

import type { Item, Moneda } from "@repo/domain";
import { calcularValorInventario, withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

export interface InventarioData {
  items: Item[];
  monedas: Moneda[];
  valorInventario: string;
}

// Consolida en UNA sola transacción lo que la página de Inventario pedía en
// 3 Server Actions independientes desde 2 componentes distintos
// (InventarioResumen: listarItems + obtenerValorInventario — que además
// volvía a leer `items` en su propia transacción interna —, ItemCatalogo:
// listarItems + listarMonedas) — 4 round-trips remotos contra Supabase para
// una sola carga de página, la misma "cada handshake de RLS domina el
// tiempo de carga" que ya se había resuelto en el Dashboard
// (obtener-dashboard.ts). Solo Producto: Servicios ya no es una sesión del
// sistema.
export const obtenerInventario = withErrorHandling(
  async (negocioId: string): Promise<InventarioData> => {
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    return withRlsContext(cuenta.id, negocioId, async (tx) => {
      const [itemsRaw, monedasRaw] = await Promise.all([
        tx.item.findMany({
          where: { cuentaId: cuenta.id, negocioId, tipo: "PRODUCTO" },
          orderBy: { createdAt: "asc" },
        }),
        tx.moneda.findMany({ where: { cuentaId: cuenta.id, negocioId }, orderBy: { createdAt: "asc" } }),
      ]);

      const items: Item[] = itemsRaw.map((item) => ({
        id: item.id,
        negocioId: item.negocioId,
        tipo: item.tipo as Item["tipo"],
        nombre: item.nombre,
        precioVenta: item.precioVenta.toString(),
        monedaId: item.monedaId,
        costoCompra: item.costoCompra?.toString() ?? null,
        stockActual: item.stockActual.toString(),
        tieneMovimientos: item.tieneMovimientos,
        imagenUrl: item.imagenUrl,
        nroCalce: item.nroCalce,
        proveedor: item.proveedor,
      }));

      const monedas: Moneda[] = monedasRaw.map((m) => ({
        id: m.id,
        cuentaId: m.cuentaId,
        negocioId: m.negocioId,
        ambito: m.ambito as Moneda["ambito"],
        codigo: m.codigo,
        nombre: m.nombre,
        esBase: m.esBase,
        activa: m.activa,
      }));

      const valorInventario = calcularValorInventario(itemsRaw).total;

      return { items, monedas, valorInventario };
    });
  }
);
