"use server";

import { revalidatePath } from "next/cache";
import type { CuentaFinanciera } from "@repo/domain";
import { crearCuentaFinancieraSchema } from "@repo/domain/schemas";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// AC1: solo CAJA/BANCO se crean por esta vía — TARJETA se gestiona en
// Story 4.2 (pasivo, no liquidez). Por ahora no hay una Server Action
// dedicada a crear tarjetas (no pedida explícitamente por ninguna story);
// se pueden crear con el mismo mecanismo de datos si una story futura lo
// requiere, ampliando este schema.
// `negocioId: null` (Story 6.3) crea la cuenta CAJA/BANCO de Personal —
// mismo criterio que `listarMonedas`/`listarTiposGasto`, generalizado acá
// para que Personal tenga dónde reflejar sus gastos sin cuenta financiera.
export const crearCuentaFinanciera = withErrorHandling(
  async (negocioId: string | null, input: unknown): Promise<CuentaFinanciera> => {
    const parsed = crearCuentaFinancieraSchema.parse(input);
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    const cuentaFinanciera = await withRlsContext(cuenta.id, negocioId, (tx) =>
      tx.cuentaFinanciera.create({
        data: {
          cuentaId: cuenta.id,
          negocioId,
          ambito: negocioId ? "LABORAL" : "PERSONAL",
          tipo: parsed.tipo,
          nombre: parsed.nombre,
          monedaId: parsed.monedaId,
        },
      })
    );

    revalidatePath(negocioId ? "/laboral/saldos" : "/personal/gastos");

    return {
      id: cuentaFinanciera.id,
      cuentaId: cuentaFinanciera.cuentaId,
      negocioId: cuentaFinanciera.negocioId,
      ambito: cuentaFinanciera.ambito as CuentaFinanciera["ambito"],
      tipo: cuentaFinanciera.tipo as CuentaFinanciera["tipo"],
      nombre: cuentaFinanciera.nombre,
      monedaId: cuentaFinanciera.monedaId,
      saldoActual: cuentaFinanciera.saldoActual.toString(),
      limiteCredito: cuentaFinanciera.limiteCredito?.toString() ?? null,
    };
  }
);
