"use server";

import { revalidatePath } from "next/cache";
import type { Moneda, Result } from "@repo/domain";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";

class MonedaBaseError extends Error {}

// No usa `withErrorHandling`: necesita distinguir "no existe / es de otra
// cuenta o negocio" (NOT_FOUND, resuelto por RLS) de "es la moneda base y no
// se puede desactivar" (FORBIDDEN, AC4/Task 2) — el wrapper genérico
// colapsaría ambos casos en el mismo `DATABASE_ERROR`.
export async function desactivarMoneda(
  monedaId: string,
  negocioId: string
): Promise<Result<Moneda>> {
  const requestId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const cuenta = await getCurrentAccount();
  if (!cuenta) {
    return {
      ok: false,
      error: { code: "UNAUTHENTICATED", message: "No hay sesión activa.", requestId, timestamp },
    };
  }

  try {
    const moneda = await withRlsContext(cuenta.id, negocioId, async (tx) => {
      const existente = await tx.moneda.findUniqueOrThrow({ where: { id: monedaId } });
      if (existente.esBase) throw new MonedaBaseError();

      return tx.moneda.update({ where: { id: monedaId }, data: { activa: false } });
    });

    revalidatePath("/laboral/configuracion");

    return {
      ok: true,
      data: {
        id: moneda.id,
        cuentaId: moneda.cuentaId,
        negocioId: moneda.negocioId,
        ambito: moneda.ambito as Moneda["ambito"],
        codigo: moneda.codigo,
        nombre: moneda.nombre,
        esBase: moneda.esBase,
        activa: moneda.activa,
      },
    };
  } catch (e) {
    if (e instanceof MonedaBaseError) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "No podés desactivar la moneda base (Guaraní).",
          requestId,
          timestamp,
        },
      };
    }
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Moneda no encontrada.", requestId, timestamp },
    };
  }
}
