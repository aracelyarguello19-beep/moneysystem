"use server";

import { revalidatePath } from "next/cache";
import type { CuentaFinanciera, Item, Venta } from "@repo/domain";
import {
  assertCantidadValidaParaVentaItem,
  assertCostoServicioValido,
  assertCuentaFinancieraNoEsTarjeta,
  calcularTotalVenta,
} from "@repo/domain";
import { registrarVentaSchema } from "@repo/domain/schemas";
import { aplicarMovimientoCuenta, resolverTasaCambioVigente, withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// AC2/AC3/AC4 completos: reducción de stock, ajuste de saldo (INGRESO) si
// el cobro no es a crédito, y cuenta por cobrar si es CREDITO_CLIENTE —
// AC2/AC4 wireados retroactivamente en Story 4.2/3.4 una vez que
// `CuentaFinanciera`/`CuentaPorCobrar` pasaron a existir. AC5 (impuesto
// para Ingresos Netos) queda satisfecho con solo persistir el campo — el
// cálculo en sí es Story 5.1.
// [Source: architecture/backend-architecture.md#Service Architecture, Story 3.1/3.4/4.2 Completion Notes]
export const registrarVenta = withErrorHandling(
  async (negocioId: string, input: unknown): Promise<Venta> => {
    const parsed = registrarVentaSchema.parse(input);
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    const venta = await withRlsContext(cuenta.id, negocioId, async (tx) => {
      const itemsResueltos: { itemId: string; cantidad: string | null; precioUnitario: string; costoServicio: string | null; costoUnitario: string | null; esLibre: boolean; tipo: Item["tipo"] }[] = [];

      for (const ventaItem of parsed.items) {
        const item = await tx.item.findUniqueOrThrow({ where: { id: ventaItem.itemId } });
        const tipo = item.tipo as Item["tipo"];
        assertCantidadValidaParaVentaItem({ tipo }, ventaItem.cantidad);
        assertCostoServicioValido({ tipo }, ventaItem.costoServicio);
        itemsResueltos.push({
          itemId: ventaItem.itemId,
          cantidad: ventaItem.cantidad,
          precioUnitario: ventaItem.precioUnitario,
          costoServicio: ventaItem.costoServicio ?? null,
          // Congela el costo del Producto al momento de vender — nunca se
          // vuelve a leer en vivo del catálogo (ver migración
          // 20260901200000_venta_item_costo_unitario). En una "venta libre"
          // (sobre pedido, fuera de inventario) el costo lo tipeó quien
          // vende, no se lee del catálogo.
          costoUnitario: ventaItem.esLibre
            ? (ventaItem.costoUnitario ?? "0")
            : tipo === "PRODUCTO"
              ? (item.costoCompra?.toString() ?? "0")
              : null,
          esLibre: ventaItem.esLibre ?? false,
          tipo,
        });
      }

      // Story 5.3, Coding Standard "Tasa de Cambio Inmutable": el cliente
      // nunca decide `tasaCambioId` — se resuelve server-side, vigente a
      // "ahora" (la venta no tiene un campo `fecha` propio en el schema de
      // entrada, se crea con `now()`), y queda grabada de forma inmutable.
      const moneda = await tx.moneda.findUniqueOrThrow({ where: { id: parsed.monedaId } });
      const tasaCambio = moneda.esBase
        ? null
        : await resolverTasaCambioVigente(tx, parsed.monedaId, new Date());

      const nueva = await tx.venta.create({
        data: {
          negocioId,
          cuentaId: cuenta.id,
          cliente: parsed.cliente ?? null,
          formaCobro: parsed.formaCobro,
          impuesto: parsed.impuesto,
          cuentaFinancieraId: parsed.cuentaFinancieraId,
          monedaId: parsed.monedaId,
          tasaCambioId: tasaCambio?.id ?? null,
          ventaItems: {
            create: itemsResueltos.map((vi) => ({
              itemId: vi.itemId,
              cantidad: vi.cantidad,
              precioUnitario: vi.precioUnitario,
              costoServicio: vi.costoServicio,
              costoUnitario: vi.costoUnitario,
              esLibre: vi.esLibre,
            })),
          },
        },
      });

      for (const vi of itemsResueltos) {
        // Una línea "venta libre" nunca toca stock — es sobre pedido, no
        // sale del inventario propio (ver Story rediseño Ventas/Inventario).
        if (!vi.esLibre && vi.tipo === "PRODUCTO" && vi.cantidad) {
          await tx.item.update({
            where: { id: vi.itemId },
            data: {
              stockActual: { decrement: vi.cantidad },
              tieneMovimientos: true,
            },
          });
        }

        // El costo de una venta libre de Producto sí se registra como
        // Compra (afectaInventario: false) para que aparezca en el flujo de
        // caja/balance, sin sumar unidades al inventario.
        if (vi.esLibre && vi.tipo === "PRODUCTO") {
          await tx.compra.create({
            data: {
              negocioId,
              cuentaId: cuenta.id,
              itemId: vi.itemId,
              costoUnitario: vi.costoUnitario ?? "0",
              cantidad: vi.cantidad ?? "1",
              fecha: new Date(),
              formaPago: "CREDITO_PROVEEDOR",
              cuentaFinancieraId: null,
              monedaId: parsed.monedaId,
              tasaCambioId: tasaCambio?.id ?? null,
              afectaInventario: false,
            },
          });
        }
      }

      // AC4 (Story 3.1) / Story 3.4: una venta a crédito genera su cuenta
      // por cobrar en la misma transacción. `cliente` está garantizado
      // no-null acá por el refine de `registrarVentaSchema`.
      if (parsed.formaCobro === "CREDITO_CLIENTE") {
        await tx.cuentaPorCobrar.create({
          data: {
            negocioId,
            cuentaId: cuenta.id,
            ventaId: nueva.id,
            cliente: parsed.cliente!,
            montoOriginal: calcularTotalVenta(itemsResueltos),
          },
        });
      } else if (parsed.cuentaFinancieraId) {
        // AC2 (Story 3.1) / Story 4.2: a diferencia de Compra/Gasto, en una
        // Venta "TARJETA" significa que el cliente pagó con tarjeta (la
        // plata entra al negocio) — nunca se refiere a la tarjeta de
        // crédito propia del negocio (eso es un pasivo, solo aplica al
        // pagar, no al cobrar). Por eso EFECTIVO/BANCO/TARJETA se tratan
        // igual acá: un INGRESO a una CuentaFinanciera que no puede ser de
        // tipo TARJETA (no se puede "cobrar" contra el propio pasivo).
        const cuentaFinanciera = await tx.cuentaFinanciera.findUniqueOrThrow({
          where: { id: parsed.cuentaFinancieraId },
        });
        assertCuentaFinancieraNoEsTarjeta({ tipo: cuentaFinanciera.tipo as CuentaFinanciera["tipo"] });

        await aplicarMovimientoCuenta(tx, {
          cuentaFinancieraId: parsed.cuentaFinancieraId,
          tipo: "INGRESO",
          monto: calcularTotalVenta(itemsResueltos),
          referenciaTipo: "VENTA",
          referenciaId: nueva.id,
        });
      }

      return nueva;
    });

    revalidatePath("/laboral/ventas");
    revalidatePath("/laboral/inventario");
    revalidatePath("/laboral/servicios");
    revalidatePath("/laboral/cuentas-por-cobrar");
    revalidatePath("/laboral/indicadores");

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
