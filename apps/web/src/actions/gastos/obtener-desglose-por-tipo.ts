"use server";

import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

export interface DesgloseGastoTipo {
  tipoGastoNombre: string;
  total: string;
}

// Desglose de gastos del mes en curso agrupados por tipo de gasto — alimenta
// la dona "OPEX Breakdown" de Gastos, mismo período que Stitch (mes actual).
// Suma montos crudos sin convertir moneda, mismo criterio ya establecido en
// `obtenerTendenciaMensual` para no introducir un motor de conversión nuevo.
export const obtenerDesgloseGastosPorTipo = withErrorHandling(
  async (negocioId: string): Promise<DesgloseGastoTipo[]> => {
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    const hoy = new Date();
    const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const hasta = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);

    const gastos = await withRlsContext(cuenta.id, negocioId, (tx) =>
      tx.gasto.findMany({
        where: { negocioId, fecha: { gte: desde, lt: hasta } },
        include: { tipoGasto: true },
      })
    );

    const totales = new Map<string, number>();
    for (const g of gastos) {
      const nombre = g.tipoGasto.nombre;
      totales.set(nombre, (totales.get(nombre) ?? 0) + Number(g.monto));
    }

    return Array.from(totales.entries())
      .map(([tipoGastoNombre, total]) => ({ tipoGastoNombre, total: total.toString() }))
      .sort((a, b) => Number(b.total) - Number(a.total));
  }
);
