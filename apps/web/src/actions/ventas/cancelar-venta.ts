"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import type { Item, Venta } from "@repo/domain";
import {
  assertDevolucionValida,
  calcularEstadoCxC,
  calcularEstadoVenta,
  calcularMontoARefundar,
} from "@repo/domain";
import { cancelarVentaSchema } from "@repo/domain/schemas";
import { aplicarMovimientoCuenta, withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// AC1-AC5 completos: cancelación total o parcial, reversión de stock para
// Producto, ajuste de saldo (reembolso, EGRESO) si la venta no era a
// crédito, ajuste de la cuenta por cobrar si lo era, y dato base para
// Ingresos Netos. AC4/AC5 wireados retroactivamente en Story 4.2/3.4 una
// vez que `CuentaFinanciera`/`CuentaPorCobrar` pasaron a existir.
// [Source: architecture/backend-architecture.md#Service Architecture, Story 3.3/3.4/4.2 Completion Notes]
export const cancelarVenta = withErrorHandling(
  async (negocioId: string, ventaId: string, input: unknown): Promise<Venta> => {
    const parsed = cancelarVentaSchema.parse(input);
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    const venta = await withRlsContext(cuenta.id, negocioId, async (tx) => {
      const ventaActual = await tx.venta.findUniqueOrThrow({
        where: { id: ventaId },
        include: { ventaItems: { include: { item: true } }, moneda: true, tasaCambio: true },
      });

      // Sin `itemsDevueltos`: cancelación total — devuelve todo el pendiente
      // de cada línea (cantidad original menos lo ya devuelto). Un Servicio
      // sin cantidad explícita cuenta como 1 unidad, igual que en
      // `calcularTotalVenta`/`assertDevolucionValida`.
      const devoluciones =
        parsed.itemsDevueltos ??
        ventaActual.ventaItems.map((vi) => {
          const original = vi.cantidad ?? new Prisma.Decimal(1);
          const pendiente = original.minus(vi.cantidadDevuelta);
          return { ventaItemId: vi.id, cantidad: pendiente.toString() };
        });

      let valorDevuelto = new Prisma.Decimal(0);

      for (const dev of devoluciones) {
        const ventaItem = ventaActual.ventaItems.find((vi) => vi.id === dev.ventaItemId);
        if (!ventaItem) continue;

        assertDevolucionValida(
          {
            cantidad: ventaItem.cantidad?.toString() ?? null,
            cantidadDevuelta: ventaItem.cantidadDevuelta.toString(),
          },
          dev.cantidad
        );

        await tx.ventaItem.update({
          where: { id: dev.ventaItemId },
          data: { cantidadDevuelta: { increment: dev.cantidad } },
        });

        valorDevuelto = valorDevuelto.plus(ventaItem.precioUnitario.times(dev.cantidad));

        // Venta libre de un producto fuera de catálogo: `item` es null
        // (nunca se crea un Item para eso) — se asume PRODUCTO, único tipo
        // que puede venderse "libre".
        const tipo = (ventaItem.item?.tipo as Item["tipo"] | undefined) ?? "PRODUCTO";
        // Una línea "venta libre" nunca descontó stock al vender (no sale de
        // inventario propio) — devolverla tampoco debe sumarlo.
        if (tipo === "PRODUCTO" && !ventaItem.esLibre) {
          await tx.item.update({
            where: { id: ventaItem.itemId! },
            data: { stockActual: { increment: dev.cantidad } },
          });
        }
      }

      // AC5 (Story 3.3) / Story 3.4: si la venta era a crédito, la
      // devolución reduce el monto adeudado proporcionalmente a lo
      // devuelto. Si el cliente ya había pagado más de lo que el nuevo
      // monto adeudado dice (típicamente: devolución total con un pago
      // parcial ya cobrado), esa plata de más no corresponde a ninguna
      // deuda vigente y se le reembolsa (EGRESO) desde la(s) misma(s)
      // cuenta(s) donde había entrado — a pedido: antes quedaba cobrada sin
      // reembolsar y la cuenta marcada como "PAGADO" aunque nunca se haya
      // devuelto ese dinero.
      if (ventaActual.formaCobro === "CREDITO_CLIENTE") {
        const cxc = await tx.cuentaPorCobrar.findUnique({ where: { ventaId } });
        if (cxc) {
          const nuevoMontoOriginal = Prisma.Decimal.max(
            0,
            cxc.montoOriginal.minus(valorDevuelto)
          );

          let montoPagadoNuevo = cxc.montoPagado;
          let restante = new Prisma.Decimal(
            calcularMontoARefundar(cxc.montoPagado.toString(), nuevoMontoOriginal.toString())
          );

          if (restante.greaterThan(0)) {
            // Más reciente primero: si hay que reembolsar solo una parte de
            // lo cobrado, se deshace lo último cobrado antes que lo más
            // viejo (mismo criterio LIFO que cualquier reverso puntual).
            const pagos = await tx.pagoCxC.findMany({
              where: { cuentaPorCobrarId: cxc.id },
              orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
            });

            for (const pago of pagos) {
              if (restante.lessThanOrEqualTo(0)) break;

              const aReembolsar = Prisma.Decimal.min(pago.monto, restante);
              await aplicarMovimientoCuenta(tx, {
                cuentaFinancieraId: pago.cuentaFinancieraId,
                tipo: "EGRESO",
                monto: aReembolsar.toString(),
                referenciaTipo: "PAGO_CXC",
                referenciaId: pago.id,
              });

              if (aReembolsar.greaterThanOrEqualTo(pago.monto)) {
                await tx.pagoCxC.delete({ where: { id: pago.id } });
              } else {
                await tx.pagoCxC.update({
                  where: { id: pago.id },
                  data: { monto: { decrement: aReembolsar } },
                });
              }

              montoPagadoNuevo = montoPagadoNuevo.minus(aReembolsar);
              restante = restante.minus(aReembolsar);
            }
          }

          const nuevoEstado = calcularEstadoCxC(
            nuevoMontoOriginal.toString(),
            montoPagadoNuevo.toString()
          );
          await tx.cuentaPorCobrar.update({
            where: { id: cxc.id },
            data: { montoOriginal: nuevoMontoOriginal, montoPagado: montoPagadoNuevo, estado: nuevoEstado },
          });
        }
      } else if (ventaActual.cuentaFinancieraId && valorDevuelto.greaterThan(0)) {
        // AC4 (Story 3.3) / Story 4.2: si la venta ya estaba cobrada
        // (no era a crédito), la devolución es un reembolso — EGRESO sobre
        // la misma cuenta financiera que recibió el cobro original.
        // `valorDevuelto` está en Guaraníes (los ítems siempre se
        // registran ahí, ver `registrarVenta`) — si la venta se cobró en
        // una moneda distinta a la oficial, hay que reconvertirlo a esa
        // moneda con la MISMA cotización que se usó al vender (el
        // snapshot inmutable en `tasaCambio`, nunca la vigente de hoy):
        // eso es lo que de verdad se acreditó, y es lo que hay que
        // reembolsar.
        const montoEgreso = ventaActual.moneda.esBase
          ? valorDevuelto
          : valorDevuelto.dividedBy(ventaActual.tasaCambio!.tasa);

        await aplicarMovimientoCuenta(tx, {
          cuentaFinancieraId: ventaActual.cuentaFinancieraId,
          tipo: "EGRESO",
          monto: montoEgreso.toString(),
          referenciaTipo: "VENTA",
          referenciaId: ventaId,
        });
      }

      const itemsActualizados = await tx.ventaItem.findMany({ where: { ventaId } });
      const estado = calcularEstadoVenta(
        itemsActualizados.map((vi) => ({
          cantidad: vi.cantidad?.toString() ?? null,
          cantidadDevuelta: vi.cantidadDevuelta.toString(),
        }))
      );

      return tx.venta.update({ where: { id: ventaId }, data: { estado } });
    });

    revalidatePath("/laboral/ventas");
    revalidatePath("/laboral/inventario");
    revalidatePath("/laboral/servicios");
    revalidatePath("/laboral/cuentas-por-cobrar");
    revalidatePath("/laboral/indicadores");
    revalidatePath("/laboral/caja");

    return {
      id: venta.id,
      negocioId: venta.negocioId,
      cliente: venta.cliente,
      fecha: venta.fecha,
      formaCobro: venta.formaCobro as Venta["formaCobro"],
      impuesto: venta.impuesto.toString(),
      estado: venta.estado as Venta["estado"],
      cuentaFinancieraId: venta.cuentaFinancieraId,
      monedaId: venta.monedaId,
      tasaCambioId: venta.tasaCambioId,
    };
  }
);
