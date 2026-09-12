"use server";

import type { EstadoCxC, Item, Venta, VentaConItems } from "@repo/domain";
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
      include: { ventaItems: { include: { item: true } }, cuentasPorCobrar: true },
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
    cxc: v.cuentasPorCobrar[0]
      ? {
          estado: v.cuentasPorCobrar[0].estado as EstadoCxC,
          montoOriginal: v.cuentasPorCobrar[0].montoOriginal.toString(),
          montoPagado: v.cuentasPorCobrar[0].montoPagado.toString(),
        }
      : null,
    items: v.ventaItems.map((vi) => ({
      id: vi.id,
      ventaId: vi.ventaId,
      itemId: vi.itemId,
      nombreLibre: vi.nombreLibre,
      cantidad: vi.cantidad?.toString() ?? null,
      precioUnitario: vi.precioUnitario.toString(),
      costoServicio: vi.costoServicio?.toString() ?? null,
      costoUnitario: vi.costoUnitario?.toString() ?? null,
      cantidadDevuelta: vi.cantidadDevuelta.toString(),
      esLibre: vi.esLibre,
      // Sin `item` (producto fuera de catálogo, tipeado a mano en una venta
      // libre): `nombreLibre` es el único nombre que existe, y se asume
      // PRODUCTO — este flujo nunca aplica a Servicios.
      itemNombre: vi.item?.nombre ?? vi.nombreLibre ?? "Producto fuera de catálogo",
      itemTipo: (vi.item?.tipo as Item["tipo"] | undefined) ?? "PRODUCTO",
    })),
  }));
});
