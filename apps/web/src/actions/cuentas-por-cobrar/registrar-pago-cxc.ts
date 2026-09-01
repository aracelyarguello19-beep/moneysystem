"use server";

import { revalidatePath } from "next/cache";
import type { CuentaFinanciera, CuentaPorCobrar, Result } from "@repo/domain";
import {
  assertCuentaFinancieraNoEsTarjeta,
  assertPagoValido,
  calcularEstadoCxC,
  CuentaFinancieraTipoInvalidoError,
  PagoExcedeSaldoError,
} from "@repo/domain";
import { registrarPagoCxCSchema } from "@repo/domain/schemas";
import { aplicarMovimientoCuenta, withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";

// AC2 completo: el pago, el recálculo de estado (PENDIENTE→PARCIAL→PAGADO)
// y el ajuste de saldo de caja/banco (INGRESO vía `aplicarMovimientoCuenta`,
// wireado retroactivamente en Story 4.2 una vez que `CuentaFinanciera` pasó
// a existir).
// No usa `withErrorHandling`: necesita distinguir "pago excede el saldo"
// (VALIDATION) de "no existe / de otro negocio" (NOT_FOUND, vía RLS).
export async function registrarPagoCxC(
  negocioId: string,
  cuentaPorCobrarId: string,
  input: unknown
): Promise<Result<CuentaPorCobrar>> {
  const requestId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const parsed = registrarPagoCxCSchema.safeParse(input);
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
      const cxc = await tx.cuentaPorCobrar.findUniqueOrThrow({ where: { id: cuentaPorCobrarId } });

      assertPagoValido(
        { montoOriginal: cxc.montoOriginal.toString(), montoPagado: cxc.montoPagado.toString() },
        parsed.data.monto
      );

      const cuentaFinanciera = await tx.cuentaFinanciera.findUniqueOrThrow({
        where: { id: parsed.data.cuentaFinancieraId },
      });
      assertCuentaFinancieraNoEsTarjeta({ tipo: cuentaFinanciera.tipo as CuentaFinanciera["tipo"] });

      const pago = await tx.pagoCxC.create({
        data: {
          cuentaPorCobrarId,
          monto: parsed.data.monto,
          cuentaFinancieraId: parsed.data.cuentaFinancieraId,
        },
      });

      await aplicarMovimientoCuenta(tx, {
        cuentaFinancieraId: parsed.data.cuentaFinancieraId,
        tipo: "INGRESO",
        monto: parsed.data.monto,
        referenciaTipo: "PAGO_CXC",
        referenciaId: pago.id,
      });

      const nuevoMontoPagado = cxc.montoPagado.plus(parsed.data.monto);
      const estado = calcularEstadoCxC(cxc.montoOriginal.toString(), nuevoMontoPagado.toString());

      return tx.cuentaPorCobrar.update({
        where: { id: cuentaPorCobrarId },
        data: { montoPagado: nuevoMontoPagado, estado },
      });
    });

    revalidatePath("/laboral/cuentas-por-cobrar");

    return {
      ok: true,
      data: {
        id: actualizada.id,
        negocioId: actualizada.negocioId,
        ventaId: actualizada.ventaId,
        cliente: actualizada.cliente,
        montoOriginal: actualizada.montoOriginal.toString(),
        montoPagado: actualizada.montoPagado.toString(),
        estado: actualizada.estado as CuentaPorCobrar["estado"],
      },
    };
  } catch (e) {
    if (e instanceof PagoExcedeSaldoError || e instanceof CuentaFinancieraTipoInvalidoError) {
      return {
        ok: false,
        error: { code: "VALIDATION", message: e.message, requestId, timestamp },
      };
    }
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Cuenta por cobrar no encontrada.", requestId, timestamp },
    };
  }
}
