"use server";

import { Prisma } from "@prisma/client";
import type { Result } from "@repo/domain";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";

class TipoGastoEnUsoError extends Error {}

// No usa `withErrorHandling`: igual que `eliminarCuentaFinanciera`, necesita
// distinguir "está en uso" (tiene gastos registrados con este tipo, y el
// borrado real violaría esa FK) de "no existe" (NOT_FOUND).
export async function eliminarTipoGasto(
  tipoGastoId: string,
  negocioId: string
): Promise<Result<{ id: string }>> {
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
    await withRlsContext(cuenta.id, negocioId, async (tx) => {
      await tx.tipoGasto.findUniqueOrThrow({ where: { id: tipoGastoId } });

      try {
        await tx.tipoGasto.delete({ where: { id: tipoGastoId } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
          throw new TipoGastoEnUsoError();
        }
        throw e;
      }
    });

    // Sin revalidatePath: TipoGastoCatalogo se refresca solo (cargar()
    // después del delete) — ver mismo criterio en registrar-gasto.ts.

    return { ok: true, data: { id: tipoGastoId } };
  } catch (e) {
    if (e instanceof TipoGastoEnUsoError) {
      return {
        ok: false,
        error: {
          code: "DATABASE_ERROR",
          message: "Este tipo de gasto ya tiene gastos registrados — no se puede eliminar.",
          requestId,
          timestamp,
        },
      };
    }
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Tipo de gasto no encontrado.", requestId, timestamp },
    };
  }
}
