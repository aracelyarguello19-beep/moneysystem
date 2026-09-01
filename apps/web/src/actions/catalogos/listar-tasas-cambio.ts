"use server";

import type { Moneda, TasaCambio } from "@repo/domain";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

export interface MonedaConTasa {
  moneda: Moneda;
  tasaVigente: TasaCambio | null;
}

// AC5: para cada moneda no base del negocio activo, qué tasa se usó (la más
// reciente) y en qué fecha se registró (`vigenteDesde`).
export const listarTasasCambio = withErrorHandling(
  async (negocioId: string): Promise<MonedaConTasa[]> => {
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    return withRlsContext(cuenta.id, negocioId, async (tx) => {
      const monedas = await tx.moneda.findMany({
        where: { cuentaId: cuenta.id, negocioId, esBase: false, activa: true },
        orderBy: { createdAt: "asc" },
      });

      const resultado: MonedaConTasa[] = [];
      for (const m of monedas) {
        const tasa = await tx.tasaCambio.findFirst({
          where: { monedaId: m.id },
          orderBy: { vigenteDesde: "desc" },
        });

        resultado.push({
          moneda: {
            id: m.id,
            cuentaId: m.cuentaId,
            negocioId: m.negocioId,
            ambito: m.ambito as Moneda["ambito"],
            codigo: m.codigo,
            nombre: m.nombre,
            esBase: m.esBase,
            activa: m.activa,
          },
          tasaVigente: tasa
            ? {
                id: tasa.id,
                monedaId: tasa.monedaId,
                tasa: tasa.tasa.toString(),
                vigenteDesde: tasa.vigenteDesde,
                registradaPor: tasa.registradaPor,
              }
            : null,
        });
      }

      return resultado;
    });
  }
);
