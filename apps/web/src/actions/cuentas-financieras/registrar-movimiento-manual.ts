"use server";

import { revalidatePath } from "next/cache";
import type { CuentaFinanciera, Result } from "@repo/domain";
import { assertCuentaFinancieraNoEsTarjeta } from "@repo/domain";
import { registrarMovimientoManualSchema } from "@repo/domain/schemas";
import { aplicarMovimientoCuenta, withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";

// Ajuste manual de saldo (depósito inicial, corrección) sobre Efectivo o
// Banco — la falta de esto era el "error" reportado: no había forma de
// cargar un monto a una cuenta recién creada salvo registrando una compra o
// venta. No usa `withErrorHandling`: necesita distinguir "es tarjeta"
// (VALIDATION, esa se mueve solo vía pago de resumen/interés) de "no
// existe/de otro negocio" (NOT_FOUND, vía RLS).
export async function registrarMovimientoManual(
  negocioId: string,
  input: unknown
): Promise<Result<CuentaFinanciera>> {
  const requestId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const parsed = registrarMovimientoManualSchema.safeParse(input);
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
      const cuentaFinanciera = await tx.cuentaFinanciera.findUniqueOrThrow({
        where: { id: parsed.data.cuentaFinancieraId },
      });
      assertCuentaFinancieraNoEsTarjeta({ tipo: cuentaFinanciera.tipo as CuentaFinanciera["tipo"] });

      await aplicarMovimientoCuenta(tx, {
        cuentaFinancieraId: parsed.data.cuentaFinancieraId,
        tipo: parsed.data.tipo,
        monto: parsed.data.monto,
        referenciaTipo: "MANUAL",
      });

      return tx.cuentaFinanciera.findUniqueOrThrow({ where: { id: parsed.data.cuentaFinancieraId } });
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
      error: { code: "NOT_FOUND", message: "Cuenta no encontrada.", requestId, timestamp },
    };
  }
}
