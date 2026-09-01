"use server";

import { revalidatePath } from "next/cache";
import type { ReglaRetiro } from "@repo/domain";
import { configurarReglaRetiroSchema } from "@repo/domain/schemas";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// AC1/AC3: única regla por negocio (`negocioId` @unique) — upsert según
// exista. Desactivar (`activa: false`) o ajustar el `valor` de la regla de
// un negocio nunca toca la de otro negocio, aislado por
// `withRlsContext(cuentaId, negocioId, fn)`. `ultimoPeriodoAplicado` nunca
// se toca acá — es exclusivo del job de cierre de período (ADR-001).
export const configurarReglaRetiro = withErrorHandling(
  async (negocioId: string, input: unknown): Promise<ReglaRetiro> => {
    const parsed = configurarReglaRetiroSchema.parse(input);
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    const regla = await withRlsContext(cuenta.id, negocioId, (tx) =>
      tx.reglaRetiro.upsert({
        where: { negocioId },
        create: {
          negocioId,
          tipo: parsed.tipo,
          valor: parsed.valor,
          activa: parsed.activa,
        },
        update: {
          tipo: parsed.tipo,
          valor: parsed.valor,
          activa: parsed.activa,
        },
      })
    );

    revalidatePath("/laboral/retiros");

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
