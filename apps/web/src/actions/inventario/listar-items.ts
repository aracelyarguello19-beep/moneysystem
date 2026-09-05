"use server";

import type { Item } from "@repo/domain";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// Listado del catálogo del negocio activo — necesario para la UI de Task 3,
// no pedido explícitamente como Server Action en el Task 1 pero implícito en
// "File Locations" (`actions/inventario/`) y en el propio AC5.
export const listarItems = withErrorHandling(async (negocioId: string): Promise<Item[]> => {
  const cuenta = await getCurrentAccount();
  if (!cuenta) throw new Error("No hay sesión activa");

  const items = await withRlsContext(cuenta.id, negocioId, (tx) =>
    tx.item.findMany({
      where: { cuentaId: cuenta.id, negocioId },
      orderBy: { createdAt: "asc" },
    })
  );

  return items.map((item) => ({
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
});
