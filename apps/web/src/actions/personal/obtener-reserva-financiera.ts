"use server";

import type { ReservaFinanciera } from "@repo/domain";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// AC1: `null` cuando la cuenta todavía no configuró ninguna reserva.
export const obtenerReservaFinanciera = withErrorHandling(
  async (): Promise<ReservaFinanciera | null> => {
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    const reserva = await withRlsContext(cuenta.id, null, (tx) =>
      tx.reservaFinanciera.findUnique({ where: { cuentaId: cuenta.id } })
    );
    if (!reserva) return null;

    return {
      id: reserva.id,
      cuentaId: reserva.cuentaId,
      objetivoMonto: reserva.objetivoMonto.toString(),
      aportePorPeriodo: reserva.aportePorPeriodo.toString(),
      periodo: reserva.periodo as ReservaFinanciera["periodo"],
      progresoAcumulado: reserva.progresoAcumulado.toString(),
      ultimoPeriodoAplicado: reserva.ultimoPeriodoAplicado,
    };
  }
);
