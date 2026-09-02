"use server";

import type { Item, Venta, VentaConItems } from "@repo/domain";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// Listado con detalle de ítems (incluye nombre/tipo, resuelto vía join con
// `items`) — necesario para la UI de Story 3.2 (señalizar Servicio sin
// costo registrado).
export const listarVentas = withErrorHandling(async (negocioId: string): Promise<VentaConItems[]> => {
  const cuenta = await getCurrentAccount();
  if (!cuenta) throw new Error("No hay sesión activa");

  const ventas = await withRlsContext(cuenta.id, negocioId, (tx) =>
    tx.venta.findMany({
      where: { negocioId },
      include: { ventaItems: { include: { item: true } } },
      orderBy: { createdAt: "desc" },
    })
  );

  return ventas.map((v) => ({
    id: v.id,
    negocioId: v.negocioId,
    cliente: v.cliente,
    fecha: v.fecha,
    formaCobro: v.formaCobro as Venta["formaCobro"],
    impuesto: v.impuesto.toString(),
    estado: v.estado as Venta["estado"],
    cuentaFinancieraId: v.cuentaFinancieraId,
    monedaId: v.monedaId,
    tasaCambioId: v.tasaCambioId,
    items: v.ventaItems.map((vi) => ({
      id: vi.id,
      ventaId: vi.ventaId,
      itemId: vi.itemId,
      cantidad: vi.cantidad?.toString() ?? null,
      precioUnitario: vi.precioUnitario.toString(),
      costoServicio: vi.costoServicio?.toString() ?? null,
      costoUnitario: vi.costoUnitario?.toString() ?? null,
      cantidadDevuelta: vi.cantidadDevuelta.toString(),
      esLibre: vi.esLibre,
      itemNombre: vi.item.nombre,
      itemTipo: vi.item.tipo as Item["tipo"],
    })),
  }));
});
