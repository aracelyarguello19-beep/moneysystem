"use server";

import type { ValorInventario } from "@repo/domain";
import { calcularValorInventario, withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// AC3: el valor se recalcula en cada acceso a partir de `items.stock_actual`
// (que Story 2.2/Epic 3 ya mantienen actualizado dentro de sus propias
// transacciones) — no hay estado propio que recalcular ni cachear acá.
// [Source: architecture/api-specification.md#Convención de Server Actions]
export const obtenerValorInventario = withErrorHandling(
  async (negocioId: string): Promise<ValorInventario> => {
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    return withRlsContext(cuenta.id, negocioId, async (tx) => {
      const productos = await tx.item.findMany({
        where: { cuentaId: cuenta.id, negocioId, tipo: "PRODUCTO" },
        orderBy: { nombre: "asc" },
      });

      return calcularValorInventario(productos);
    });
  }
);
