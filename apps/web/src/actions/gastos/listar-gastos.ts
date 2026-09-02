"use server";

import type { Gasto, TipoGasto } from "@repo/domain";
import { obtenerClasificacionGasto } from "@repo/domain";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// Listado con el nombre y clasificación del tipo de gasto ya resueltos (join
// con `tipos_gasto`) — necesario para la UI, no pedido como Server Action
// explícita en las Tasks pero implícito para poder mostrar algo en
// `/laboral/gastos` (mismo criterio que `listarItems`/`listarVentas`).
export const listarGastos = withErrorHandling(
  async (
    negocioId: string
  ): Promise<(Gasto & { tipoGastoNombre: string; clasificacion: TipoGasto["clasificacion"] })[]> => {
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    const gastos = await withRlsContext(cuenta.id, negocioId, (tx) =>
      tx.gasto.findMany({
        where: { cuentaId: cuenta.id, negocioId },
        include: { tipoGasto: true },
        orderBy: { fecha: "desc" },
      })
    );

    return gastos.map((g) => ({
      id: g.id,
      cuentaId: g.cuentaId,
      negocioId: g.negocioId,
      ambito: g.ambito as Gasto["ambito"],
      tipoGastoId: g.tipoGastoId,
      monto: g.monto.toString(),
      monedaId: g.monedaId,
      fecha: g.fecha,
      formaPago: g.formaPago as Gasto["formaPago"],
      cuentaFinancieraId: g.cuentaFinancieraId,
      tipoGastoNombre: g.tipoGasto.nombre,
      clasificacion: obtenerClasificacionGasto({
        clasificacion: g.tipoGasto.clasificacion as TipoGasto["clasificacion"],
      }),
    }));
  }
);
