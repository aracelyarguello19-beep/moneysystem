"use server";

import { revalidatePath } from "next/cache";
import type { Item } from "@repo/domain";
import { crearItemSchema } from "@repo/domain/schemas";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// [Source: architecture/api-specification.md#Convención de Server Actions]
export const crearItem = withErrorHandling(
  async (negocioId: string, input: unknown): Promise<Item> => {
    const parsed = crearItemSchema.parse(input);
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    const item = await withRlsContext(cuenta.id, negocioId, (tx) =>
      tx.item.create({
        data: {
          negocioId,
          cuentaId: cuenta.id,
          tipo: parsed.tipo,
          nombre: parsed.nombre,
          precioVenta: parsed.precioVenta,
          monedaId: parsed.monedaId,
          costoCompra: parsed.costoCompra,
          stockActual: parsed.stockActual,
          imagenUrl: parsed.imagenUrl ?? null,
        },
      })
    );

    revalidatePath("/laboral/inventario");
    revalidatePath("/laboral/servicios");

    return {
      id: item.id,
      negocioId: item.negocioId,
      tipo: item.tipo as Item["tipo"],
      nombre: item.nombre,
      precioVenta: item.precioVenta.toString(),
      monedaId: item.monedaId,
      costoCompra: item.costoCompra?.toString() ?? null,
      stockActual: item.stockActual.toString(),
      tieneMovimientos: item.tieneMovimientos,
      imagenUrl: item.imagenUrl,
    };
  }
);
