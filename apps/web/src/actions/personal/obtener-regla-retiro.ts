"use server";

import type { ReglaRetiro } from "@repo/domain";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// AC1/AC3: `null` cuando el negocio todavía no configuró ninguna regla —
// la UI lo distingue de "regla desactivada" (`activa: false`, sí existe).
export const obtenerReglaRetiro = withErrorHandling(
  async (negocioId: string): Promise<ReglaRetiro | null> => {
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    const regla = await withRlsContext(cuenta.id, negocioId, (tx) =>
      tx.reglaRetiro.findUnique({ where: { negocioId } })
    );
    if (!regla) return null;

    return {
      id: regla.id,
      negocioId: regla.negocioId,
      tipo: regla.tipo as ReglaRetiro["tipo"],
      valor: regla.valor.toString(),
      periodo: regla.periodo as ReglaRetiro["periodo"],
      activa: regla.activa,
      ultimoPeriodoAplicado: regla.ultimoPeriodoAplicado,
    };
  }
);
