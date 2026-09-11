"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import type { CuentaFinanciera } from "@repo/domain";
import { editarCuentaFinancieraSchema } from "@repo/domain/schemas";
import { aplicarMovimientoCuenta, aplicarMovimientoTarjeta, withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// Edición de campos no estructurales (nombre, límite de crédito) + corrección
// directa de saldo. `saldoActual` en el input es el valor final que el
// usuario quiere ver, no un delta — acá se calcula la diferencia contra el
// saldo vigente y se aplica como un movimiento más (nunca se pisa la
// columna directo), para que la corrección quede auditada en
// `movimientos_cuenta`/`movimientos_tarjeta` igual que cualquier otro
// movimiento (ver ledger.ts).
export const editarCuentaFinanciera = withErrorHandling(
  async (cuentaFinancieraId: string, negocioId: string, input: unknown): Promise<CuentaFinanciera> => {
    const parsed = editarCuentaFinancieraSchema.parse(input);
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    const actualizada = await withRlsContext(cuenta.id, negocioId, async (tx) => {
      const existente = await tx.cuentaFinanciera.findUniqueOrThrow({ where: { id: cuentaFinancieraId } });

      await tx.cuentaFinanciera.update({
        where: { id: cuentaFinancieraId },
        data: {
          nombre: parsed.nombre,
          limiteCredito: parsed.limiteCredito,
        },
      });

      if (parsed.saldoActual !== undefined) {
        const delta = new Prisma.Decimal(parsed.saldoActual).minus(existente.saldoActual);
        if (!delta.isZero()) {
          if (existente.tipo === "TARJETA") {
            await aplicarMovimientoTarjeta(tx, {
              cuentaFinancieraId,
              tipo: delta.isPositive() ? "PAGO_RESUMEN" : "CONSUMO",
              monto: delta.abs().toString(),
              referenciaTipo: "MANUAL",
            });
          } else {
            await aplicarMovimientoCuenta(tx, {
              cuentaFinancieraId,
              tipo: delta.isPositive() ? "INGRESO" : "EGRESO",
              monto: delta.abs().toString(),
              referenciaTipo: "MANUAL",
            });
          }
        }
      }

      return tx.cuentaFinanciera.findUniqueOrThrow({ where: { id: cuentaFinancieraId } });
    });

    revalidatePath("/laboral/caja");

    return {
      id: actualizada.id,
      cuentaId: actualizada.cuentaId,
      negocioId: actualizada.negocioId,
      tipo: actualizada.tipo as CuentaFinanciera["tipo"],
      nombre: actualizada.nombre,
      banco: actualizada.banco,
      alias: actualizada.alias,
      detalleOtro: actualizada.detalleOtro,
      monedaId: actualizada.monedaId,
      saldoActual: actualizada.saldoActual.toString(),
      limiteCredito: actualizada.limiteCredito?.toString() ?? null,
    };
  }
);
