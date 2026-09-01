"use server";

import type { IndicadoresFinancieros, Item, TipoGasto, Venta } from "@repo/domain";
import { calcularIndicadores } from "@repo/domain";
import { periodoFiltroSchema } from "@repo/domain/schemas";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// AC1/AC2: consulta los datos crudos del período dentro de `withRlsContext`
// y delega el cálculo a `calcularIndicadores` (función pura en
// packages/domain) — esta Server Action no calcula nada por sí misma, solo
// resuelve y mapea los datos. AC4 (recálculo en tiempo real) no usa React
// Query (no está en el stack del proyecto, mismo criterio que Story 2.3/4.3):
// la UI vuelve a llamar a esta acción tras cada mutación relevante.
export const obtenerIndicadores = withErrorHandling(
  async (negocioId: string, periodo: unknown): Promise<IndicadoresFinancieros> => {
    const parsed = periodoFiltroSchema.parse(periodo);
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    return withRlsContext(cuenta.id, negocioId, async (tx) => {
      const ventas = await tx.venta.findMany({
        where: { negocioId, fecha: { gte: parsed.desde, lte: parsed.hasta } },
        include: { ventaItems: { include: { item: true } } },
      });

      const gastos = await tx.gasto.findMany({
        where: { negocioId, fecha: { gte: parsed.desde, lte: parsed.hasta } },
        include: { tipoGasto: true },
      });

      return calcularIndicadores({
        ventas: ventas.map((v) => ({
          estado: v.estado as Venta["estado"],
          impuesto: v.impuesto.toString(),
          items: v.ventaItems.map((vi) => ({
            itemTipo: vi.item.tipo as Item["tipo"],
            cantidad: vi.cantidad?.toString() ?? null,
            cantidadDevuelta: vi.cantidadDevuelta.toString(),
            precioUnitario: vi.precioUnitario.toString(),
            costoServicio: vi.costoServicio?.toString() ?? null,
            costoCompra: vi.item.costoCompra?.toString() ?? null,
          })),
        })),
        gastos: gastos.map((g) => ({
          monto: g.monto.toString(),
          clasificacion: g.tipoGasto.clasificacion as TipoGasto["clasificacion"],
        })),
      });
    });
  }
);
