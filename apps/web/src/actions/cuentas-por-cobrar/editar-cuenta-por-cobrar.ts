"use server";

import { revalidatePath } from "next/cache";
import type { CuentaPorCobrar, Result } from "@repo/domain";
import { assertMontoOriginalValido, calcularEstadoCxC, MontoOriginalMenorAPagadoError } from "@repo/domain";
import { editarCuentaPorCobrarSchema } from "@repo/domain/schemas";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";

// No usa `withErrorHandling`: "el monto es menor a lo ya pagado" necesita un
// mensaje propio (VALIDATION), distinto de "no existe / de otro negocio"
// (NOT_FOUND, vía RLS) — mismo criterio que registrar-pago-cxc.ts.
export async function editarCuentaPorCobrar(
  cuentaPorCobrarId: string,
  negocioId: string,
  input: unknown
): Promise<Result<CuentaPorCobrar>> {
  const requestId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const parsed = editarCuentaPorCobrarSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: parsed.error.issues[0]?.message ?? "Datos inválidos.",
        requestId,
        timestamp,
      },
    };
  }

  const cuenta = await getCurrentAccount();
  if (!cuenta) {
    return {
      ok: false,
      error: { code: "UNAUTHENTICATED", message: "No hay sesión activa.", requestId, timestamp },
    };
  }

  try {
    const actualizada = await withRlsContext(cuenta.id, negocioId, async (tx) => {
      const cxc = await tx.cuentaPorCobrar.findUniqueOrThrow({ where: { id: cuentaPorCobrarId } });

      assertMontoOriginalValido({ montoPagado: cxc.montoPagado.toString() }, parsed.data.montoOriginal);

      const estado = calcularEstadoCxC(parsed.data.montoOriginal, cxc.montoPagado.toString());

      return tx.cuentaPorCobrar.update({
        where: { id: cuentaPorCobrarId },
        data: { cliente: parsed.data.cliente, montoOriginal: parsed.data.montoOriginal, estado },
      });
    });

    revalidatePath("/laboral/cuentas-por-cobrar");

    return {
      ok: true,
      data: {
        id: actualizada.id,
        negocioId: actualizada.negocioId,
        ventaId: actualizada.ventaId,
        cliente: actualizada.cliente,
        montoOriginal: actualizada.montoOriginal.toString(),
        montoPagado: actualizada.montoPagado.toString(),
        estado: actualizada.estado as CuentaPorCobrar["estado"],
      },
    };
  } catch (e) {
    if (e instanceof MontoOriginalMenorAPagadoError) {
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
