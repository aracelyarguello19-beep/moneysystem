"use server";

import { revalidatePath } from "next/cache";
import type { CuentaFinanciera, Result } from "@repo/domain";
import {
  assertCuentaFinancieraNoEsTarjeta,
  assertMismaMoneda,
  CuentaFinancieraTipoInvalidoError,
  MonedaInvalidaError,
} from "@repo/domain";
import { transferirEntreCuentasSchema } from "@repo/domain/schemas";
import { aplicarMovimientoCuenta, withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";

// Transferencia entre 2 cuentas Efectivo/Banco propias de la MISMA moneda
// (nunca Tarjeta, esa no es liquidez) — un EGRESO en origen y un INGRESO
// en destino por el mismo monto, sin convertir: mover plata de una caja a
// un banco (o entre dos bancos/cajas) no cambia el total, solo dónde está
// guardada. Para cambiar de moneda existe `comprarMoneda`, no esto.
//
// No usa `withErrorHandling`: sus mensajes de validación específicos
// (monedas distintas, cuenta Tarjeta) tienen que llegar al usuario tal
// cual, no como el genérico "Ocurrió un error al procesar la operación."
export async function transferirEntreCuentas(
  negocioId: string,
  input: unknown
): Promise<Result<CuentaFinanciera>> {
  const requestId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const parsed = transferirEntreCuentasSchema.safeParse(input);
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
      const origen = await tx.cuentaFinanciera.findUniqueOrThrow({
        where: { id: parsed.data.cuentaFinancieraOrigenId },
      });
      assertCuentaFinancieraNoEsTarjeta({ tipo: origen.tipo as CuentaFinanciera["tipo"] });

      const destino = await tx.cuentaFinanciera.findUniqueOrThrow({
        where: { id: parsed.data.cuentaFinancieraDestinoId },
      });
      assertCuentaFinancieraNoEsTarjeta({ tipo: destino.tipo as CuentaFinanciera["tipo"] });

      assertMismaMoneda({ id: origen.monedaId }, { id: destino.monedaId });

      await aplicarMovimientoCuenta(tx, {
        cuentaFinancieraId: origen.id,
        tipo: "EGRESO",
        monto: parsed.data.monto,
        referenciaTipo: "TRANSFERENCIA",
        referenciaId: destino.id,
      });
      await aplicarMovimientoCuenta(tx, {
        cuentaFinancieraId: destino.id,
        tipo: "INGRESO",
        monto: parsed.data.monto,
        referenciaTipo: "TRANSFERENCIA",
        referenciaId: origen.id,
      });

      return tx.cuentaFinanciera.findUniqueOrThrow({ where: { id: origen.id } });
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
  } catch (e) {
    if (e instanceof CuentaFinancieraTipoInvalidoError || e instanceof MonedaInvalidaError) {
      return { ok: false, error: { code: "VALIDATION", message: e.message, requestId, timestamp } };
    }
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Cuenta de origen o destino no encontrada.", requestId, timestamp },
    };
  }
}
