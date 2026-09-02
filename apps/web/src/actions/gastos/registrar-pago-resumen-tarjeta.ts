"use server";

import { revalidatePath } from "next/cache";
import type { CuentaFinanciera, Result } from "@repo/domain";
import { assertCuentaFinancieraEsTarjeta, assertCuentaFinancieraNoEsTarjeta } from "@repo/domain";
import { registrarPagoResumenTarjetaSchema } from "@repo/domain/schemas";
import { aplicarMovimientoCuenta, aplicarMovimientoTarjeta, withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";

// AC4: reduce la deuda de la tarjeta (`MovimientoTarjeta` tipo
// `PAGO_RESUMEN`) y, en la misma transacción, registra el `EGRESO` sobre la
// cuenta usada para pagar. No usa `withErrorHandling`: necesita distinguir
// "tipo de cuenta financiera inválido" (VALIDATION) de "no existe/de otro
// negocio" (NOT_FOUND, vía RLS).
export async function registrarPagoResumenTarjeta(
  negocioId: string,
  tarjetaId: string,
  input: unknown
): Promise<Result<CuentaFinanciera>> {
  const requestId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const parsed = registrarPagoResumenTarjetaSchema.safeParse(input);
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
    const actualizada = await withRlsContext(cuenta.id, negocioId, async (tx) => {
      const tarjeta = await tx.cuentaFinanciera.findUniqueOrThrow({ where: { id: tarjetaId } });
      assertCuentaFinancieraEsTarjeta({ tipo: tarjeta.tipo as CuentaFinanciera["tipo"] });

      const cuentaOrigen = await tx.cuentaFinanciera.findUniqueOrThrow({
        where: { id: parsed.data.cuentaFinancieraId },
      });
      assertCuentaFinancieraNoEsTarjeta({ tipo: cuentaOrigen.tipo as CuentaFinanciera["tipo"] });

      await aplicarMovimientoTarjeta(tx, {
        cuentaFinancieraId: tarjetaId,
        tipo: "PAGO_RESUMEN",
        monto: parsed.data.monto,
      });

      await aplicarMovimientoCuenta(tx, {
        cuentaFinancieraId: parsed.data.cuentaFinancieraId,
        tipo: "EGRESO",
        monto: parsed.data.monto,
        referenciaTipo: "MANUAL",
        referenciaId: tarjetaId,
      });

      return tx.cuentaFinanciera.findUniqueOrThrow({ where: { id: tarjetaId } });
    });

    revalidatePath("/laboral/caja");

    return {
      ok: true,
      data: {
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
      },
    };
  } catch {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Tarjeta o cuenta de origen no encontrada.", requestId, timestamp },
    };
  }
}
