"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import type { Result } from "@repo/domain";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";

class CuentaFinancieraEnUsoError extends Error {}

// No usa `withErrorHandling`: igual que `eliminarMoneda`, necesita
// distinguir "está en uso" (tiene compras/ventas/gastos/pagos con esta
// cuenta, y el borrado real violaría esas FKs) de "no existe" (NOT_FOUND).
// Los movimientos propios (`movimientos_cuenta`/`movimientos_tarjeta`) sí
// cascadean (`onDelete: Cascade` en el schema) — solo Compra/Venta/Gasto/
// PagoCxC bloquean el borrado.
export async function eliminarCuentaFinanciera(
  cuentaFinancieraId: string,
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
      await tx.cuentaFinanciera.findUniqueOrThrow({ where: { id: cuentaFinancieraId } });

      try {
        await tx.cuentaFinanciera.delete({ where: { id: cuentaFinancieraId } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
          throw new CuentaFinancieraEnUsoError();
        }
        throw e;
      }
    });

    revalidatePath("/laboral/caja");

    return { ok: true, data: { id: cuentaFinancieraId } };
  } catch (e) {
    if (e instanceof CuentaFinancieraEnUsoError) {
      return {
        ok: false,
        error: {
          code: "DATABASE_ERROR",
          message: "Esta cuenta ya tiene compras, ventas o gastos registrados — no se puede eliminar.",
          requestId,
          timestamp,
        },
      };
    }
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Cuenta no encontrada.", requestId, timestamp },
    };
  }
}
