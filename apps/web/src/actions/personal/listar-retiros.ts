"use server";

import type { RetiroUtilidad } from "@repo/domain";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// AC4: `negocioId` filtra el historial a ese negocio de origen; `null`
// agrega los retiros de TODOS los negocios de la cuenta, apoyándose en la
// RLS "relajada" de `retiros_utilidad` (Dev Notes, Story 6.1) — esta tabla
// no exige coincidencia de negocio_id, así que no requiere el bypass '*'
// restringido de Story 5.4 para la vista agregada de Personal.
export const listarRetiros = withErrorHandling(
  async (negocioId: string | null): Promise<RetiroUtilidad[]> => {
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    const retiros = await withRlsContext(cuenta.id, negocioId, (tx) =>
      tx.retiroUtilidad.findMany({
        where: { cuentaId: cuenta.id, ...(negocioId ? { negocioId } : {}) },
        orderBy: { fecha: "desc" },
      })
    );

    return retiros.map((r) => ({
      id: r.id,
      cuentaId: r.cuentaId,
      negocioId: r.negocioId,
      monto: r.monto.toString(),
      fecha: r.fecha,
      origen: r.origen as RetiroUtilidad["origen"],
      reglaId: r.reglaId,
    }));
  }
);
