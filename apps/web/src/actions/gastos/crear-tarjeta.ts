"use server";

import { revalidatePath } from "next/cache";
import type { CuentaFinanciera } from "@repo/domain";
import { crearTarjetaSchema } from "@repo/domain/schemas";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// `negocioId: null` (Story 6.4, AC1) crea la tarjeta personal — mismo
// mecanismo de datos, generalizado como se documentó como pendiente en
// `crearCuentaFinanciera` (Story 4.3 Completion Notes).
export const crearTarjeta = withErrorHandling(
  async (negocioId: string | null, input: unknown): Promise<CuentaFinanciera> => {
    const parsed = crearTarjetaSchema.parse(input);
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    const tarjeta = await withRlsContext(cuenta.id, negocioId, (tx) =>
      tx.cuentaFinanciera.create({
        data: {
          cuentaId: cuenta.id,
          negocioId,
          ambito: negocioId ? "LABORAL" : "PERSONAL",
          tipo: "TARJETA",
          nombre: parsed.nombre,
          monedaId: parsed.monedaId,
          limiteCredito: parsed.limiteCredito ?? null,
        },
      })
    );

    revalidatePath(negocioId ? "/laboral/tarjeta" : "/personal/tarjeta");

    return {
      id: tarjeta.id,
      cuentaId: tarjeta.cuentaId,
      negocioId: tarjeta.negocioId,
      ambito: tarjeta.ambito as CuentaFinanciera["ambito"],
      tipo: tarjeta.tipo as CuentaFinanciera["tipo"],
      nombre: tarjeta.nombre,
      monedaId: tarjeta.monedaId,
      saldoActual: tarjeta.saldoActual.toString(),
      limiteCredito: tarjeta.limiteCredito?.toString() ?? null,
    };
  }
);
