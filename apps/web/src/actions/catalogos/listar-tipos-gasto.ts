"use server";

import type { TipoGasto } from "@repo/domain";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// `negocioId` viaja explícito desde la UI, nunca implícito.
// [Source: architecture/coding-standards.md#Critical Fullstack Rules]
export const listarTiposGasto = withErrorHandling(
  async (negocioId: string): Promise<TipoGasto[]> => {
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    const tiposGasto = await withRlsContext(cuenta.id, negocioId, (tx) =>
      tx.tipoGasto.findMany({
        where: { cuentaId: cuenta.id, negocioId },
        orderBy: { createdAt: "asc" },
      })
    );

    return tiposGasto.map((t) => ({
      id: t.id,
      cuentaId: t.cuentaId,
      negocioId: t.negocioId,
      ambito: t.ambito as TipoGasto["ambito"],
      nombre: t.nombre,
      clasificacion: t.clasificacion as TipoGasto["clasificacion"],
    }));
  }
);
