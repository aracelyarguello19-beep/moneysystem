"use server";

import { revalidatePath } from "next/cache";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

export const eliminarGastoFijo = withErrorHandling(
  async (gastoFijoId: string, negocioId: string): Promise<{ id: string }> => {
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    await withRlsContext(cuenta.id, negocioId, (tx) => tx.gastoFijo.delete({ where: { id: gastoFijoId } }));

    revalidatePath("/laboral/gastos");
    revalidatePath("/laboral/indicadores");

    return { id: gastoFijoId };
  }
);
