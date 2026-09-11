"use server";

import { revalidatePath } from "next/cache";
import type { Result } from "@repo/domain";
import { assertItemEliminable, ItemConMovimientosError } from "@repo/domain";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";

// No usa `withErrorHandling`: necesita distinguir "ya tiene movimientos"
// (FORBIDDEN, `assertItemEliminable`) de "no existe / de otro negocio"
// (NOT_FOUND, vía RLS) — mismo criterio que editarItem/eliminarCuentaFinanciera.
export async function eliminarItem(itemId: string, negocioId: string): Promise<Result<{ id: string }>> {
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
      const item = await tx.item.findUniqueOrThrow({ where: { id: itemId } });

      assertItemEliminable({ tieneMovimientos: item.tieneMovimientos });

      await tx.item.delete({ where: { id: itemId } });
    });

    revalidatePath("/laboral/inventario");
    revalidatePath("/laboral/compras");

    return { ok: true, data: { id: itemId } };
  } catch (e) {
    if (e instanceof ItemConMovimientosError) {
      return {
        ok: false,
        error: { code: "FORBIDDEN", message: e.message, requestId, timestamp },
      };
    }
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Producto no encontrado.", requestId, timestamp },
    };
  }
}
