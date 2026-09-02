"use server";

import { revalidatePath } from "next/cache";
import type { GastoFijo } from "@repo/domain";
import { crearGastoFijoSchema } from "@repo/domain/schemas";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

export const crearGastoFijo = withErrorHandling(
  async (negocioId: string, input: unknown): Promise<GastoFijo> => {
    const parsed = crearGastoFijoSchema.parse(input);
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    const gastoFijo = await withRlsContext(cuenta.id, negocioId, (tx) =>
      tx.gastoFijo.create({
        data: {
          cuentaId: cuenta.id,
          negocioId,
          nombre: parsed.nombre,
          monto: parsed.monto,
          monedaId: parsed.monedaId,
        },
      })
    );

    revalidatePath("/laboral/gastos");
    revalidatePath("/laboral/indicadores");

    return {
      id: gastoFijo.id,
      cuentaId: gastoFijo.cuentaId,
      negocioId: gastoFijo.negocioId,
      nombre: gastoFijo.nombre,
      monto: gastoFijo.monto.toString(),
      monedaId: gastoFijo.monedaId,
      activo: gastoFijo.activo,
    };
  }
);
