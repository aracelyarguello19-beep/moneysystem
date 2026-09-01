"use server";

import type { CuentaFinanciera } from "@repo/domain";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// AC1/AC3: excluye tipo TARJETA (pasivo, cubierto por Story 4.2 —
// `listarTarjetas` — no liquidez). Agrupar por `monedaId` queda del lado de
// la UI: cada fila ya trae su `monedaId` propio. `negocioId: null` (Story
// 6.3) lista las cuentas CAJA/BANCO de Personal.
export const obtenerSaldos = withErrorHandling(
  async (negocioId: string | null): Promise<CuentaFinanciera[]> => {
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    const cuentas = await withRlsContext(cuenta.id, negocioId, (tx) =>
      tx.cuentaFinanciera.findMany({
        where: { cuentaId: cuenta.id, negocioId, tipo: { in: ["CAJA", "BANCO"] } },
        orderBy: { createdAt: "asc" },
      })
    );

    return cuentas.map((c) => ({
      id: c.id,
      cuentaId: c.cuentaId,
      negocioId: c.negocioId,
      ambito: c.ambito as CuentaFinanciera["ambito"],
      tipo: c.tipo as CuentaFinanciera["tipo"],
      nombre: c.nombre,
      monedaId: c.monedaId,
      saldoActual: c.saldoActual.toString(),
      limiteCredito: c.limiteCredito?.toString() ?? null,
    }));
  }
);
