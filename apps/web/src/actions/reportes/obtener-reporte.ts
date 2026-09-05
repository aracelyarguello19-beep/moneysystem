"use server";

import type { GastoResumenTipo, ProductoVendidoResumen } from "@repo/domain";
import { calcularProductosVendidos, calcularResumenGastos } from "@repo/domain";
import { periodoFiltroSchema } from "@repo/domain/schemas";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

export interface ReporteNegocio {
  productos: ProductoVendidoResumen[];
  gastos: GastoResumenTipo[];
}

// Reportes/Estadísticas: detalle de productos vendidos (con el estrella al
// tope, ya ordenado) y desglose de gastos por tipo + ámbito, para el período
// elegido.
export const obtenerReporte = withErrorHandling(
  async (negocioId: string, periodo: unknown): Promise<ReporteNegocio> => {
    const parsed = periodoFiltroSchema.parse(periodo);
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    return withRlsContext(cuenta.id, negocioId, async (tx) => {
      const [ventas, gastos] = await Promise.all([
        tx.venta.findMany({
          where: { negocioId, fecha: { gte: parsed.desde, lte: parsed.hasta }, estado: { not: "CANCELADA" } },
          include: { ventaItems: { include: { item: true } } },
        }),
        tx.gasto.findMany({
          where: { negocioId, fecha: { gte: parsed.desde, lte: parsed.hasta } },
          include: { tipoGasto: true },
        }),
      ]);

      // Una línea de venta libre con un producto fuera de catálogo
      // (`itemId` null) no tiene una identidad de producto real detrás —
      // cuenta para los totales del negocio (Ingresos Brutos, etc., ya
      // calculados aparte a nivel de venta), pero no se le puede atribuir
      // un ítem en el desglose "Productos vendidos" de este reporte.
      const ventaItems = ventas.flatMap((v) =>
        v.ventaItems
          .filter((vi) => vi.itemId !== null && vi.item)
          .map((vi) => ({
            itemId: vi.itemId!,
            itemNombre: vi.item!.nombre,
            cantidad: vi.cantidad?.toString() ?? null,
            precioUnitario: vi.precioUnitario.toString(),
            cantidadDevuelta: vi.cantidadDevuelta.toString(),
          }))
      );

      return {
        productos: calcularProductosVendidos(ventaItems),
        gastos: calcularResumenGastos(
          gastos.map((g) => ({
            tipoGastoId: g.tipoGastoId,
            tipoGastoNombre: g.tipoGasto.nombre,
            clasificacion: g.tipoGasto.clasificacion,
            ambito: g.ambito,
            monto: g.monto.toString(),
          }))
        ),
      };
    });
  }
);
