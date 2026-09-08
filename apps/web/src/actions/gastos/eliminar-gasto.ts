"use server";

import { revalidatePath } from "next/cache";
import type { Result } from "@repo/domain";
import { aplicarMovimientoCuenta, aplicarMovimientoTarjeta, withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";

// Eliminar un gasto no es solo borrar la fila: el gasto ya movió saldo real
// (EGRESO en cuenta/caja o CONSUMO en tarjeta, ver registrar-gasto.ts). Sin
// revertir ese movimiento primero, el saldo quedaría con un egreso fantasma
// que ya no tiene gasto detrás. Mismo criterio que editarGasto (Paso 1 de
// esa action), solo que acá no se aplica un movimiento nuevo después.
// No usa `withErrorHandling`: por ahora el único error esperable es
// "no existe / de otro negocio" (NOT_FOUND, vía RLS), pero se mantiene el
// mismo formato Result que el resto de los `eliminar*` de esta sesión.
export async function eliminarGasto(gastoId: string, negocioId: string): Promise<Result<{ id: string }>> {
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
      const gasto = await tx.gasto.findUniqueOrThrow({ where: { id: gastoId } });

      if (gasto.formaPago === "TARJETA") {
        await aplicarMovimientoTarjeta(tx, {
          cuentaFinancieraId: gasto.cuentaFinancieraId,
          tipo: "PAGO_RESUMEN",
          monto: gasto.monto.toString(),
          referenciaTipo: "GASTO",
          referenciaId: gastoId,
        });
      } else {
        await aplicarMovimientoCuenta(tx, {
          cuentaFinancieraId: gasto.cuentaFinancieraId,
          tipo: "INGRESO",
          monto: gasto.monto.toString(),
          referenciaTipo: "GASTO",
          referenciaId: gastoId,
        });
      }

      await tx.gasto.delete({ where: { id: gastoId } });
    });

    revalidatePath("/laboral/indicadores");
    revalidatePath("/laboral/caja");

    return { ok: true, data: { id: gastoId } };
  } catch {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Gasto no encontrado.", requestId, timestamp },
    };
  }
}
