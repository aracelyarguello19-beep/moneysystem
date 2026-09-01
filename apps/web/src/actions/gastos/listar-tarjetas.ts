"use server";

import type { CuentaFinanciera } from "@repo/domain";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// AC3 (Story 4.2): total adeudado en tarjetas del negocio activo — la UI
// suma `saldoActual` (negativo = deuda) sobre este listado. `negocioId:
// null` lista la tarjeta personal (Story 6.4).
export const listarTarjetas = withErrorHandling(
  async (negocioId: string | null): Promise<CuentaFinanciera[]> => {
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    const tarjetas = await withRlsContext(cuenta.id, negocioId, (tx) =>
      tx.cuentaFinanciera.findMany({
        where: { cuentaId: cuenta.id, negocioId, tipo: "TARJETA" },
        orderBy: { createdAt: "asc" },
      })
    );

    return tarjetas.map((t) => ({
      id: t.id,
      cuentaId: t.cuentaId,
      negocioId: t.negocioId,
      ambito: t.ambito as CuentaFinanciera["ambito"],
      tipo: t.tipo as CuentaFinanciera["tipo"],
      nombre: t.nombre,
      monedaId: t.monedaId,
      saldoActual: t.saldoActual.toString(),
      limiteCredito: t.limiteCredito?.toString() ?? null,
    }));
  }
);
