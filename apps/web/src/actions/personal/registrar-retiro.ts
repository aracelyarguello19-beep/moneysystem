"use server";

import { revalidatePath } from "next/cache";
import type { CuentaFinanciera, RetiroUtilidad } from "@repo/domain";
import { assertCuentaFinancieraNoEsTarjeta } from "@repo/domain";
import { registrarRetiroSchema } from "@repo/domain/schemas";
import { aplicarMovimientoCuenta, withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// AC1/AC2: el monto es siempre un input explícito del usuario (nunca se
// deriva ni se sugiere como "ganancia líquida completa" — Task 2). Reduce
// la caja/banco del negocio de origen (TARJETA queda excluida: es un
// pasivo, no liquidez retirable, mismo criterio que `registrarGasto`/
// `registrarPagoCxc`) y queda registrado como puente hacia Personal.
export const registrarRetiro = withErrorHandling(
  async (negocioId: string, input: unknown): Promise<RetiroUtilidad> => {
    const parsed = registrarRetiroSchema.parse(input);
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    const retiro = await withRlsContext(cuenta.id, negocioId, async (tx) => {
      const cuentaFinanciera = await tx.cuentaFinanciera.findUniqueOrThrow({
        where: { id: parsed.cuentaFinancieraId },
      });
      assertCuentaFinancieraNoEsTarjeta({
        tipo: cuentaFinanciera.tipo as CuentaFinanciera["tipo"],
      });

      const nuevo = await tx.retiroUtilidad.create({
        data: {
          cuentaId: cuenta.id,
          negocioId,
          monto: parsed.monto,
          fecha: parsed.fecha ?? new Date(),
          origen: "MANUAL",
          reglaId: null,
        },
      });

      await aplicarMovimientoCuenta(tx, {
        cuentaFinancieraId: parsed.cuentaFinancieraId,
        tipo: "EGRESO",
        monto: parsed.monto,
        referenciaTipo: "RETIRO",
        referenciaId: nuevo.id,
      });

      return nuevo;
    });

    revalidatePath("/laboral/saldos");
    revalidatePath("/laboral/retiros");
    revalidatePath("/personal/retiros");

    return {
      id: retiro.id,
      cuentaId: retiro.cuentaId,
      negocioId: retiro.negocioId,
      monto: retiro.monto.toString(),
      fecha: retiro.fecha,
      origen: retiro.origen as RetiroUtilidad["origen"],
      reglaId: retiro.reglaId,
    };
  }
);
