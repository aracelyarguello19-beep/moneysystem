"use server";

import { revalidatePath } from "next/cache";
import type { Result } from "@repo/domain";
import { assertCuentaPorCobrarSinPagos, CuentaPorCobrarConPagosError } from "@repo/domain";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";

// No usa `withErrorHandling`: "tiene pagos registrados" necesita un mensaje
// propio (VALIDATION) distinto de "no existe / de otro negocio" (NOT_FOUND,
// vía RLS) — mismo criterio que eliminar-cuenta-financiera.ts.
export async function eliminarCuentaPorCobrar(
  cuentaPorCobrarId: string,
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
      const cxc = await tx.cuentaPorCobrar.findUniqueOrThrow({ where: { id: cuentaPorCobrarId } });

      assertCuentaPorCobrarSinPagos({ montoPagado: cxc.montoPagado.toString() });

      await tx.cuentaPorCobrar.delete({ where: { id: cuentaPorCobrarId } });
    });

    revalidatePath("/laboral/cuentas-por-cobrar");

    return { ok: true, data: { id: cuentaPorCobrarId } };
  } catch (e) {
    if (e instanceof CuentaPorCobrarConPagosError) {
      return {
        ok: false,
        error: { code: "VALIDATION", message: e.message, requestId, timestamp },
      };
    }
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Cuenta por cobrar no encontrada.", requestId, timestamp },
    };
  }
}
