"use server";

import { revalidatePath } from "next/cache";
import type { Item, Result } from "@repo/domain";
import { assertCambioDeTipoPermitido, TipoItemBloqueadoError } from "@repo/domain";
import { editarItemSchema } from "@repo/domain/schemas";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";

// No usa `withErrorHandling`: necesita distinguir "no existe / de otro
// negocio" (NOT_FOUND, resuelto por RLS) de "el tipo está bloqueado por
// tener movimientos" (FORBIDDEN, AC3) — el wrapper genérico colapsaría
// ambos casos en `DATABASE_ERROR` o `VALIDATION`.
export async function editarItem(
  itemId: string,
  negocioId: string,
  input: unknown
): Promise<Result<Item>> {
  const requestId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const parsed = editarItemSchema.safeParse(input);
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
    const item = await withRlsContext(cuenta.id, negocioId, async (tx) => {
      const existente = await tx.item.findUniqueOrThrow({ where: { id: itemId } });

      assertCambioDeTipoPermitido(
        { tipo: existente.tipo as Item["tipo"], tieneMovimientos: existente.tieneMovimientos },
        parsed.data.tipo
      );

      return tx.item.update({
        where: { id: itemId },
        data: {
          nombre: parsed.data.nombre,
          precioVenta: parsed.data.precioVenta,
          ...(parsed.data.tipo ? { tipo: parsed.data.tipo } : {}),
        },
      });
    });

    revalidatePath("/laboral/catalogo");

    return {
      ok: true,
      data: {
        id: item.id,
        negocioId: item.negocioId,
        tipo: item.tipo as Item["tipo"],
        nombre: item.nombre,
        precioVenta: item.precioVenta.toString(),
        monedaId: item.monedaId,
        costoCompra: item.costoCompra?.toString() ?? null,
        stockActual: item.stockActual.toString(),
        tieneMovimientos: item.tieneMovimientos,
      },
    };
  } catch (e) {
    if (e instanceof TipoItemBloqueadoError) {
      return {
        ok: false,
        error: { code: "FORBIDDEN", message: e.message, requestId, timestamp },
      };
    }
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Ítem no encontrado.", requestId, timestamp },
    };
  }
}
