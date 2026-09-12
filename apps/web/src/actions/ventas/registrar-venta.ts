"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import type { CuentaFinanciera, Item, Venta } from "@repo/domain";
import {
  assertCantidadValidaParaVentaItem,
  assertCostoServicioValido,
  assertCuentaFinancieraEsTarjeta,
  assertCuentaFinancieraNoEsTarjeta,
  assertStockSuficiente,
  calcularCostoPromedioPonderado,
  calcularTotalVenta,
} from "@repo/domain";
import { registrarVentaSchema } from "@repo/domain/schemas";
import { aplicarMovimientoCuenta, aplicarMovimientoTarjeta, withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

interface ItemResuelto {
  itemId: string | null;
  nombreLibre: string | null;
  cantidad: string | null;
  precioUnitario: string;
  costoServicio: string | null;
  costoUnitario: string | null;
  esLibre: boolean;
  tipo: Item["tipo"];
  formaPagoProveedor?: "EFECTIVO" | "BANCO" | "TARJETA" | "CREDITO_PROVEEDOR";
  cuentaFinancieraProveedorId?: string | null;
}

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
      const itemsResueltos: ItemResuelto[] = [];

      for (const ventaItem of parsed.items) {
        // Venta libre de un producto que NO está en el catálogo: no hay
        // Item que resolver — `nombreLibre` es toda la identificación que
        // existe, y nunca se crea un Item nuevo a partir de esto (pedido
        // explícito: solo se registra el catálogo cuando el dueño elige un
        // producto real de las sugerencias).
        if (ventaItem.esLibre && !ventaItem.itemId) {
          assertCantidadValidaParaVentaItem({ tipo: "PRODUCTO" }, ventaItem.cantidad);
          itemsResueltos.push({
            itemId: null,
            nombreLibre: ventaItem.nombreLibre ?? null,
            cantidad: ventaItem.cantidad,
            precioUnitario: ventaItem.precioUnitario,
            costoServicio: null,
            costoUnitario: ventaItem.costoUnitario ?? "0",
            esLibre: true,
            tipo: "PRODUCTO",
            formaPagoProveedor: ventaItem.formaPagoProveedor,
            cuentaFinancieraProveedorId: ventaItem.cuentaFinancieraProveedorId,
          });
          continue;
        }

        const item = await tx.item.findUniqueOrThrow({ where: { id: ventaItem.itemId! } });
        const tipo = item.tipo as Item["tipo"];
        assertCantidadValidaParaVentaItem({ tipo }, ventaItem.cantidad);
        assertCostoServicioValido({ tipo }, ventaItem.costoServicio);
        itemsResueltos.push({
          itemId: ventaItem.itemId!,
          nombreLibre: null,
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
          formaPagoProveedor: ventaItem.formaPagoProveedor,
          cuentaFinancieraProveedorId: ventaItem.cuentaFinancieraProveedorId,
        });
      }

      // AC3 (venta descuenta stock): valida ANTES de crear nada que el
      // stock alcanza para lo pedido — sumando por ítem, no línea por
      // línea, porque dos líneas de 1 unidad contra un stock de 1 también
      // tienen que rechazarse. La UI (RegistrarVentaForm) ya evita este
      // caso acumulando en una sola línea y topando el selector al stock
      // disponible, pero esta es la barrera real: sin ella, otra sesión, un
      // cliente HTTP directo, o simplemente una carrera entre dos ventas
      // simultáneas del mismo ítem podían dejarlo en stock negativo.
      const cantidadPedidaPorItem = new Map<string, Prisma.Decimal>();
      for (const ir of itemsResueltos) {
        if (ir.itemId && ir.tipo === "PRODUCTO" && !ir.esLibre && ir.cantidad) {
          cantidadPedidaPorItem.set(
            ir.itemId,
            (cantidadPedidaPorItem.get(ir.itemId) ?? new Prisma.Decimal(0)).plus(ir.cantidad)
          );
        }
      }
      for (const [itemId, cantidadPedida] of cantidadPedidaPorItem) {
        const itemCatalogo = await tx.item.findUniqueOrThrow({ where: { id: itemId } });
        assertStockSuficiente(
          { nombre: itemCatalogo.nombre, stockActual: itemCatalogo.stockActual.toString() },
          cantidadPedida.toString()
        );
      }

      // El carrito/total de la venta siempre quedan en la moneda base
      // (Guaraníes) — `monedaId` acá es solo la moneda en la que el
      // cliente pagó (Story rediseño Caja multimoneda). Cuando no es la
      // base: `cotizacion` graba un snapshot NUEVO de TasaCambio (nunca se
      // actualiza uno existente — mismo criterio inmutable que
      // `registrarTasaCambio`, Story 5.3) que además pasa a ser la
      // "vigente" que se ve en la tarjeta de esa moneda en Caja; y
      // `montoRecibido` — no el total en Gs — es lo que se acredita en la
      // cuenta financiera de esa moneda.
      const moneda = await tx.moneda.findUniqueOrThrow({ where: { id: parsed.monedaId } });
      const monedaBase = moneda.esBase
        ? moneda
        : await tx.moneda.findFirstOrThrow({ where: { negocioId, ambito: "LABORAL", esBase: true } });
      let tasaCambioId: string | null = null;
      let montoIngreso = calcularTotalVenta(itemsResueltos);

      if (!moneda.esBase) {
        if (!parsed.cotizacion || Number(parsed.cotizacion) <= 0) {
          throw new Error("La cotización es obligatoria para ventas en una moneda distinta a la oficial.");
        }
        if (!parsed.montoRecibido || Number(parsed.montoRecibido) <= 0) {
          throw new Error("El monto recibido es obligatorio para ventas en una moneda distinta a la oficial.");
        }
        const tasaCambio = await tx.tasaCambio.create({
          data: { monedaId: parsed.monedaId, tasa: parsed.cotizacion, registradaPor: cuenta.id },
        });
        tasaCambioId = tasaCambio.id;
        montoIngreso = parsed.montoRecibido;
      }

      const nueva = await tx.venta.create({
        data: {
          negocioId,
          cuentaId: cuenta.id,
          cliente: parsed.cliente ?? null,
          formaCobro: parsed.formaCobro,
          impuesto: parsed.impuesto,
          cuentaFinancieraId: parsed.cuentaFinancieraId,
          monedaId: parsed.monedaId,
          tasaCambioId,
          ventaItems: {
            // `item` es una relación opcional (venta libre fuera de
            // catálogo) — Prisma exige pasarla como `connect` en vez del
            // FK escalar plano cuando puede ser null dentro de un `create`
            // anidado.
            create: itemsResueltos.map((vi) => ({
              item: vi.itemId ? { connect: { id: vi.itemId } } : undefined,
              nombreLibre: vi.nombreLibre,
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
            where: { id: vi.itemId! },
            data: { stockActual: { decrement: vi.cantidad }, tieneMovimientos: true },
          });
        }

        if (vi.esLibre && vi.tipo === "PRODUCTO") {
          const montoCompra = new Prisma.Decimal(vi.costoUnitario ?? "0").times(vi.cantidad ?? "1").toString();
          let compraId: string | null = null;

          // Solo se registra como Compra (afectaInventario: false, ajusta
          // el costo promedio) cuando el producto elegido SÍ está en el
          // catálogo — un producto tipeado a mano (`nombreLibre`) no tiene
          // Item detrás, así que no hay nada que actualizar ahí.
          if (vi.itemId) {
            const itemCatalogo = await tx.item.findUniqueOrThrow({ where: { id: vi.itemId } });
            const nuevoCostoCompra = calcularCostoPromedioPonderado(
              itemCatalogo.stockActual.toString(),
              itemCatalogo.costoCompra?.toString() ?? null,
              vi.cantidad ?? "1",
              vi.costoUnitario ?? "0"
            );
            await tx.item.update({
              where: { id: vi.itemId },
              data: { costoCompra: nuevoCostoCompra, tieneMovimientos: true },
            });

            const compra = await tx.compra.create({
              data: {
                negocioId,
                cuentaId: cuenta.id,
                itemId: vi.itemId,
                costoUnitario: vi.costoUnitario ?? "0",
                cantidad: vi.cantidad ?? "1",
                fecha: new Date(),
                formaPago: vi.formaPagoProveedor ?? "CREDITO_PROVEEDOR",
                cuentaFinancieraId: vi.cuentaFinancieraProveedorId ?? null,
                monedaId: monedaBase.id,
                tasaCambioId: null,
                afectaInventario: false,
              },
            });
            compraId = compra.id;
          }

          // Plata real que salió para pagarle al proveedor — sin esto, el
          // costo de la venta libre queda "flotando" sin ledger, y la caja
          // termina con plata de más (pedido explícito: registrar la
          // salida para que no sobre dinero cuando después entre el cobro
          // de la venta al cliente).
          if (
            vi.formaPagoProveedor &&
            vi.formaPagoProveedor !== "CREDITO_PROVEEDOR" &&
            vi.cuentaFinancieraProveedorId
          ) {
            const cuentaProveedor = await tx.cuentaFinanciera.findUniqueOrThrow({
              where: { id: vi.cuentaFinancieraProveedorId },
            });
            if (cuentaProveedor.monedaId !== monedaBase.id) {
              throw new Error("La cuenta de pago al proveedor debe ser de la moneda oficial del sistema.");
            }

            if (vi.formaPagoProveedor === "TARJETA") {
              assertCuentaFinancieraEsTarjeta({ tipo: cuentaProveedor.tipo as CuentaFinanciera["tipo"] });
              await aplicarMovimientoTarjeta(tx, {
                cuentaFinancieraId: vi.cuentaFinancieraProveedorId,
                tipo: "CONSUMO",
                monto: montoCompra,
                referenciaTipo: "COMPRA",
                referenciaId: compraId ?? nueva.id,
              });
            } else {
              assertCuentaFinancieraNoEsTarjeta({ tipo: cuentaProveedor.tipo as CuentaFinanciera["tipo"] });
              await aplicarMovimientoCuenta(tx, {
                cuentaFinancieraId: vi.cuentaFinancieraProveedorId,
                tipo: "EGRESO",
                monto: montoCompra,
                referenciaTipo: "COMPRA",
                referenciaId: compraId ?? nueva.id,
              });
            }
          }
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
        if (cuentaFinanciera.monedaId !== parsed.monedaId) {
          throw new Error("La cuenta seleccionada no coincide con la moneda en la que pagó el cliente.");
        }

        await aplicarMovimientoCuenta(tx, {
          cuentaFinancieraId: parsed.cuentaFinancieraId,
          tipo: "INGRESO",
          monto: montoIngreso,
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
