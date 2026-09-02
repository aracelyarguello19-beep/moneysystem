"use server";

import type { Moneda } from "@repo/domain";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// `negocioId` viaja explícito desde la UI (nunca implícito vía cookie) — el
// selector de negocio activo es la única fuente de este valor. El catálogo
// se siembra al crear el negocio (ver actions/negocios/crear-negocio.ts).
// [Source: architecture/coding-standards.md#Critical Fullstack Rules]
export const listarMonedas = withErrorHandling(
  async (negocioId: string): Promise<Moneda[]> => {
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    return withRlsContext(cuenta.id, negocioId, async (tx) => {
      const monedas = await tx.moneda.findMany({
        where: { cuentaId: cuenta.id, negocioId },
        orderBy: { createdAt: "asc" },
      });

      return monedas.map((m) => ({
        id: m.id,
        cuentaId: m.cuentaId,
        negocioId: m.negocioId,
        ambito: m.ambito as Moneda["ambito"],
        codigo: m.codigo,
        nombre: m.nombre,
        esBase: m.esBase,
        activa: m.activa,
      }));
    });
  }
);
