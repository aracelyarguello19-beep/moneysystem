import { Prisma } from "@prisma/client";
import type { ReferenciaMovimientoCuenta, ReferenciaMovimientoTarjeta } from "@repo/domain";
import { signoMovimientoCuenta, signoMovimientoTarjeta } from "@repo/domain";

// Ledger vs. saldo denormalizado (mecanismo central de Story 4.2/4.3):
// `cuentas_financieras.saldo_actual` se actualiza en la misma transacción
// que cada INSERT a `movimientos_cuenta`/`movimientos_tarjeta`, vía estas
// funciones — nunca un trigger de Postgres, para que sea testeable con
// Vitest. El ledger es la fuente de verdad auditable; el saldo denormalizado
// es una proyección para lectura rápida.
// [Source: architecture/database-schema.md — Notas de diseño transversales al esquema]

// INGRESO suma al saldo, EGRESO resta — válido tanto para CAJA/BANCO
// (saldo positivo = liquidez) como, en teoría, para cualquier cuenta no
// tarjeta.
export async function aplicarMovimientoCuenta(
  tx: Prisma.TransactionClient,
  params: {
    cuentaFinancieraId: string;
    tipo: "INGRESO" | "EGRESO";
    monto: string;
    referenciaTipo?: ReferenciaMovimientoCuenta;
    referenciaId?: string | null;
  }
): Promise<void> {
  await tx.movimientoCuenta.create({
    data: {
      cuentaFinancieraId: params.cuentaFinancieraId,
      tipo: params.tipo,
      monto: params.monto,
      referenciaTipo: params.referenciaTipo ?? null,
      referenciaId: params.referenciaId ?? null,
    },
  });

  const delta = new Prisma.Decimal(params.monto).times(signoMovimientoCuenta(params.tipo));

  await tx.cuentaFinanciera.update({
    where: { id: params.cuentaFinancieraId },
    data: { saldoActual: { increment: delta } },
  });
}

// `saldoActual` de una tarjeta: negativo = deuda (Data Model, Story 4.2).
// CONSUMO/INTERES aumentan la deuda (restan saldo); PAGO_RESUMEN la reduce
// (suma saldo).
export async function aplicarMovimientoTarjeta(
  tx: Prisma.TransactionClient,
  params: {
    cuentaFinancieraId: string;
    tipo: "CONSUMO" | "PAGO_RESUMEN" | "INTERES";
    monto: string;
    referenciaTipo?: ReferenciaMovimientoTarjeta;
    referenciaId?: string | null;
  }
): Promise<void> {
  await tx.movimientoTarjeta.create({
    data: {
      cuentaFinancieraId: params.cuentaFinancieraId,
      tipo: params.tipo,
      monto: params.monto,
      referenciaTipo: params.referenciaTipo ?? null,
      referenciaId: params.referenciaId ?? null,
    },
  });

  const delta = new Prisma.Decimal(params.monto).times(signoMovimientoTarjeta(params.tipo));

  await tx.cuentaFinanciera.update({
    where: { id: params.cuentaFinancieraId },
    data: { saldoActual: { increment: delta } },
  });
}
