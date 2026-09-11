"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import type { Compra, CuentaFinanciera, Item } from "@repo/domain";
import {
  assertCuentaFinancieraEsTarjeta,
  assertCuentaFinancieraNoEsTarjeta,
  assertItemEsProducto,
  calcularCostoPromedioPonderado,
  convertirAGuaranies,
} from "@repo/domain";
import { registrarCompraSchema } from "@repo/domain/schemas";
import { aplicarMovimientoCuenta, aplicarMovimientoTarjeta, withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// AC3 (stock) y AC3/AC4 (ajuste de saldo/deuda, wireado retroactivamente en
// Story 4.2 una vez que `CuentaFinanciera`/el ledger pasaron a existir)
// están completos. `CREDITO_PROVEEDOR` no ajusta ningún saldo (no hay
// `CuentaPorPagar` modelada — la deuda con el proveedor no está en el data
// model de este proyecto, solo se documenta la forma de pago).
//
// `items` permite registrar una compra de varios productos a la vez (mismo
// proveedor/fecha/forma de pago/cuenta), cada uno en su propia moneda: cada
// línea crea su propia fila de `Compra` (con SU costo/moneda tal como se
// pactó) y actualiza el stock/costo promedio de su propio ítem — no hay una
// tabla de línea de compra en el modelo (a diferencia de VentaItem), así que
// "una compra con 3 productos" son 3 filas de `Compra` con el mismo
// proveedor/fecha/forma de pago, más UN solo movimiento de cuenta/tarjeta
// por el total EN GUARANÍES (no uno por línea, para no fragmentar el egreso
// real de una cuenta que es siempre en moneda oficial).
//
// El costo promedio ponderado de cada ítem (Inventario) vive siempre en
// Guaraníes — una línea en moneda extranjera se convierte con la
// `cotizacion` cargada acá ANTES de mezclarla con el costo previo del ítem,
// nunca se promedian números de monedas distintas sin convertir. Esa misma
// `cotizacion` crea un snapshot nuevo de TasaCambio (Coding Standard "Tasa
// de Cambio Inmutable") que pasa a ser la vigente del sistema para esa
// moneda, igual que ya hace registrarVenta.
// [Source: architecture/api-specification.md#Convención de Server Actions, Story 4.2/5.3 Completion Notes]
export const registrarCompra = withErrorHandling(
  async (negocioId: string, input: unknown): Promise<Compra[]> => {
    const parsed = registrarCompraSchema.parse(input);
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    const compras = await withRlsContext(cuenta.id, negocioId, async (tx) => {
      const creadas: Awaited<ReturnType<typeof tx.compra.create>>[] = [];
      // Cachea la TasaCambio recién creada por moneda+cotización dentro de
      // esta misma compra — el caso común es un solo proveedor y una sola
      // cotización para todas las líneas en esa moneda extranjera, y esto
      // evita insertar snapshots inmutables duplicados para el mismo valor.
      const tasaCreadaPorClave = new Map<string, string>();
      let totalGs = new Prisma.Decimal(0);

      for (const linea of parsed.items) {
        const item = await tx.item.findUniqueOrThrow({ where: { id: linea.itemId } });
        assertItemEsProducto({ tipo: item.tipo as Item["tipo"] });

        const moneda = await tx.moneda.findUniqueOrThrow({ where: { id: linea.monedaId } });

        let tasaCambioId: string | null = null;
        if (!moneda.esBase) {
          if (!linea.cotizacion || Number(linea.cotizacion) <= 0) {
            throw new Error(
              `La cotización es obligatoria para los productos en ${moneda.codigo} (moneda distinta a la oficial).`
            );
          }
          const clave = `${linea.monedaId}:${linea.cotizacion}`;
          let idCacheado = tasaCreadaPorClave.get(clave);
          if (!idCacheado) {
            const tasaCambio = await tx.tasaCambio.create({
              data: { monedaId: linea.monedaId, tasa: linea.cotizacion, registradaPor: cuenta.id },
            });
            idCacheado = tasaCambio.id;
            tasaCreadaPorClave.set(clave, idCacheado);
          }
          tasaCambioId = idCacheado;
        }

        const nueva = await tx.compra.create({
          data: {
            negocioId,
            cuentaId: cuenta.id,
            itemId: linea.itemId,
            costoUnitario: linea.costoUnitario,
            cantidad: linea.cantidad,
            fecha: parsed.fecha,
            proveedor: parsed.proveedor ?? null,
            formaPago: parsed.formaPago,
            cuentaFinancieraId: parsed.cuentaFinancieraId,
            monedaId: linea.monedaId,
            tasaCambioId,
          },
        });

        const costoUnitarioEnGs = convertirAGuaranies({
          monto: linea.costoUnitario,
          esMonedaBase: moneda.esBase,
          tasa: moneda.esBase ? null : linea.cotizacion!,
        });

        // Costo promedio ponderado: se calcula con el stock/costo *previos*
        // a esta línea (ver calcularCostoPromedioPonderado) — si el mismo
        // ítem aparece en dos líneas de esta misma compra, la segunda ya lee
        // el stock/costo actualizado por la primera (se procesan en orden,
        // no en paralelo), así que el promedio sigue siendo correcto.
        const nuevoCostoCompra = calcularCostoPromedioPonderado(
          item.stockActual.toString(),
          item.costoCompra?.toString() ?? null,
          linea.cantidad,
          costoUnitarioEnGs
        );

        await tx.item.update({
          where: { id: linea.itemId },
          data: {
            stockActual: { increment: linea.cantidad },
            costoCompra: nuevoCostoCompra,
            tieneMovimientos: true,
          },
        });

        totalGs = totalGs.plus(new Prisma.Decimal(costoUnitarioEnGs).times(linea.cantidad));
        creadas.push(nueva);
      }

      if (parsed.cuentaFinancieraId) {
        const cuentaFinanciera = await tx.cuentaFinanciera.findUniqueOrThrow({
          where: { id: parsed.cuentaFinancieraId },
        });
        const montoTotal = totalGs.toString();

        if (parsed.formaPago === "TARJETA") {
          assertCuentaFinancieraEsTarjeta({ tipo: cuentaFinanciera.tipo as CuentaFinanciera["tipo"] });
          await aplicarMovimientoTarjeta(tx, {
            cuentaFinancieraId: parsed.cuentaFinancieraId,
            tipo: "CONSUMO",
            monto: montoTotal,
            referenciaTipo: "COMPRA",
            referenciaId: creadas[0].id,
          });
        } else {
          assertCuentaFinancieraNoEsTarjeta({ tipo: cuentaFinanciera.tipo as CuentaFinanciera["tipo"] });
          await aplicarMovimientoCuenta(tx, {
            cuentaFinancieraId: parsed.cuentaFinancieraId,
            tipo: "EGRESO",
            monto: montoTotal,
            referenciaTipo: "COMPRA",
            referenciaId: creadas[0].id,
          });
        }
      }

      return creadas;
    });

    revalidatePath("/laboral/compras");
    revalidatePath("/laboral/indicadores");
    revalidatePath("/laboral/inventario");
    revalidatePath("/laboral/caja");

    return compras.map((compra) => ({
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
    }));
  }
);
