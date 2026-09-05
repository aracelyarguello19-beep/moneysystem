"use server";

import type { Compra } from "@repo/domain";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// Historial de compras de la sesión "Compras" — cada fila es una compra
// puntual con su propio costo (nunca promediado acá: el promedio ponderado
// vive en el ítem, ver registrar-compra.ts), con el nombre/nro de calce del
// producto ya resueltos (join con `items`) para no pedirlo aparte en la UI.
export const listarCompras = withErrorHandling(
  async (negocioId: string): Promise<(Compra & { itemNombre: string; itemNroCalce: string | null })[]> => {
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    const compras = await withRlsContext(cuenta.id, negocioId, (tx) =>
      tx.compra.findMany({
        where: { cuentaId: cuenta.id, negocioId, afectaInventario: true },
        include: { item: true },
        orderBy: { fecha: "desc" },
      })
    );

    return compras.map((c) => ({
      id: c.id,
      negocioId: c.negocioId,
      itemId: c.itemId,
      costoUnitario: c.costoUnitario.toString(),
      cantidad: c.cantidad.toString(),
      fecha: c.fecha,
      proveedor: c.proveedor,
      formaPago: c.formaPago as Compra["formaPago"],
      cuentaFinancieraId: c.cuentaFinancieraId,
      monedaId: c.monedaId,
      tasaCambioId: c.tasaCambioId,
      afectaInventario: c.afectaInventario,
      itemNombre: c.item.nombre,
      itemNroCalce: c.item.nroCalce,
    }));
  }
);
