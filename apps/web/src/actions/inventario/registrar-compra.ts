"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import type { Compra, CuentaFinanciera, Item } from "@repo/domain";
import {
  assertCuentaFinancieraEsTarjeta,
  assertCuentaFinancieraNoEsTarjeta,
  assertItemEsProducto,
  calcularCostoPromedioPonderado,
} from "@repo/domain";
import { registrarCompraSchema } from "@repo/domain/schemas";
import {
  aplicarMovimientoCuenta,
  aplicarMovimientoTarjeta,
  resolverTasaCambioVigente,
  withRlsContext,
} from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// AC3 (stock) y AC3/AC4 (ajuste de saldo/deuda, wireado retroactivamente en
// Story 4.2 una vez que `CuentaFinanciera`/el ledger pasaron a existir)
// están completos. `CREDITO_PROVEEDOR` no ajusta ningún saldo (no hay
// `CuentaPorPagar` modelada — la deuda con el proveedor no está en el data
// model de este proyecto, solo se documenta la forma de pago).
// [Source: architecture/api-specification.md#Convención de Server Actions, Story 4.2 Completion Notes]
export const registrarCompra = withErrorHandling(
  async (negocioId: string, input: unknown): Promise<Compra> => {
    const parsed = registrarCompraSchema.parse(input);
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    const compra = await withRlsContext(cuenta.id, negocioId, async (tx) => {
      const item = await tx.item.findUniqueOrThrow({ where: { id: parsed.itemId } });
      assertItemEsProducto({ tipo: item.tipo as Item["tipo"] });

      // Story 5.3, AC3/AC4 / Coding Standard "Tasa de Cambio Inmutable": el
      // cliente nunca decide `tasaCambioId` — se resuelve acá, la vigente a
      // `fecha`, y queda grabada de forma inmutable en la compra.
      const moneda = await tx.moneda.findUniqueOrThrow({ where: { id: parsed.monedaId } });
      const tasaCambio = moneda.esBase
        ? null
        : await resolverTasaCambioVigente(tx, parsed.monedaId, parsed.fecha);

      const nueva = await tx.compra.create({
        data: {
          negocioId,
          cuentaId: cuenta.id,
          itemId: parsed.itemId,
          costoUnitario: parsed.costoUnitario,
          cantidad: parsed.cantidad,
          fecha: parsed.fecha,
          proveedor: parsed.proveedor ?? null,
          formaPago: parsed.formaPago,
          cuentaFinancieraId: parsed.cuentaFinancieraId,
          monedaId: parsed.monedaId,
          tasaCambioId: tasaCambio?.id ?? null,
        },
      });

      // Costo promedio ponderado: se calcula con el stock/costo *previos* a
      // esta compra (ver calcularCostoPromedioPonderado) — nunca se pisa con
      // el costo de esta compra sola, para que dos compras del mismo ítem a
      // precios distintos queden reflejadas en un único costo coherente.
      const nuevoCostoCompra = calcularCostoPromedioPonderado(
        item.stockActual.toString(),
        item.costoCompra?.toString() ?? null,
        parsed.cantidad,
        parsed.costoUnitario
      );

      await tx.item.update({
        where: { id: parsed.itemId },
        data: {
          stockActual: { increment: parsed.cantidad },
          costoCompra: nuevoCostoCompra,
          tieneMovimientos: true,
        },
      });

      if (parsed.cuentaFinancieraId) {
        const cuentaFinanciera = await tx.cuentaFinanciera.findUniqueOrThrow({
          where: { id: parsed.cuentaFinancieraId },
        });
        const montoTotal = new Prisma.Decimal(parsed.costoUnitario)
          .times(parsed.cantidad)
          .toString();

        if (parsed.formaPago === "TARJETA") {
          assertCuentaFinancieraEsTarjeta({ tipo: cuentaFinanciera.tipo as CuentaFinanciera["tipo"] });
          await aplicarMovimientoTarjeta(tx, {
            cuentaFinancieraId: parsed.cuentaFinancieraId,
            tipo: "CONSUMO",
            monto: montoTotal,
            referenciaTipo: "COMPRA",
            referenciaId: nueva.id,
          });
        } else {
          assertCuentaFinancieraNoEsTarjeta({ tipo: cuentaFinanciera.tipo as CuentaFinanciera["tipo"] });
          await aplicarMovimientoCuenta(tx, {
            cuentaFinancieraId: parsed.cuentaFinancieraId,
            tipo: "EGRESO",
            monto: montoTotal,
            referenciaTipo: "COMPRA",
            referenciaId: nueva.id,
          });
        }
      }

      return nueva;
    });

    revalidatePath("/laboral/compras");
    revalidatePath("/laboral/indicadores");
    revalidatePath("/laboral/inventario");

    return {
      id: compra.id,
      negocioId: compra.negocioId,
      itemId: compra.itemId,
      costoUnitario: compra.costoUnitario.toString(),
      cantidad: compra.cantidad.toString(),
      fecha: compra.fecha,
      proveedor: compra.proveedor,
      formaPago: compra.formaPago as Compra["formaPago"],
      cuentaFinancieraId: compra.cuentaFinancieraId,
      monedaId: compra.monedaId,
      tasaCambioId: compra.tasaCambioId,
      afectaInventario: compra.afectaInventario,
    };
  }
);
