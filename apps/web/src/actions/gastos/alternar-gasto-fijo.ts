"use server";

import { revalidatePath } from "next/cache";
import type { GastoFijo } from "@repo/domain";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// Activar/desactivar en vez de borrar: un gasto fijo desactivado sale de la
// meta mínima diaria del Dashboard pero conserva su historial.
export const alternarGastoFijo = withErrorHandling(
  async (gastoFijoId: string, negocioId: string, activo: boolean): Promise<GastoFijo> => {
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    const gastoFijo = await withRlsContext(cuenta.id, negocioId, (tx) =>
      tx.gastoFijo.update({ where: { id: gastoFijoId }, data: { activo } })
    );

    revalidatePath("/laboral/gastos");
    revalidatePath("/laboral/indicadores");

    return {
      id: gastoFijo.id,
      cuentaId: gastoFijo.cuentaId,
      negocioId: gastoFijo.negocioId,
      nombre: gastoFijo.nombre,
      monto: gastoFijo.monto.toString(),
      monedaId: gastoFijo.monedaId,
      activo: gastoFijo.activo,
    };
  }
);
