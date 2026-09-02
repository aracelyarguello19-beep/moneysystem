"use server";

import type { GastoFijo } from "@repo/domain";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

export const listarGastosFijos = withErrorHandling(
  async (negocioId: string): Promise<GastoFijo[]> => {
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    const gastosFijos = await withRlsContext(cuenta.id, negocioId, (tx) =>
      tx.gastoFijo.findMany({
        where: { cuentaId: cuenta.id, negocioId },
        orderBy: { createdAt: "asc" },
      })
    );

    return gastosFijos.map((g) => ({
      id: g.id,
      cuentaId: g.cuentaId,
      negocioId: g.negocioId,
      nombre: g.nombre,
      monto: g.monto.toString(),
      monedaId: g.monedaId,
      activo: g.activo,
    }));
  }
);
