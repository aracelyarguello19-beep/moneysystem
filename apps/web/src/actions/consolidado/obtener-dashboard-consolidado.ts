"use server";

import { Prisma } from "@prisma/client";
import type { DashboardConsolidado, Item, TipoGasto, Venta } from "@repo/domain";
import { calcularIndicadores, consolidarIndicadoresPorNegocio, convertirAGuaranies } from "@repo/domain";
import { periodoFiltroSchema } from "@repo/domain/schemas";
// ⚠️ ÚNICO ARCHIVO AUTORIZADO A IMPORTAR `withRlsContextConsolidado` — ver
// el comentario extenso en packages/database/src/index.ts (Bypass
// Consolidado Restringido). No importar desde ningún otro archivo del repo.
import { resolverTasaCambioVigente, withRlsContextConsolidado } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

async function resolverConversion(
  tx: Prisma.TransactionClient,
  monedaId: string,
  fecha: Date
): Promise<{ esMonedaBase: boolean; tasa: string | null }> {
  const moneda = await tx.moneda.findUniqueOrThrow({ where: { id: monedaId } });
  if (moneda.esBase) return { esMonedaBase: true, tasa: null };
  const tasaCambio = await resolverTasaCambioVigente(tx, monedaId, fecha);
  return { esMonedaBase: false, tasa: tasaCambio?.tasa.toString() ?? null };
}

// AC1/AC2/AC3: única Server Action de todo el sistema que opera sobre TODOS
// los negocios de la cuenta a la vez (bypass `'*'` de RLS, solo lectura).
// AC1/AC4: cada negocio se convierte a Guaraníes con su propia tasa
// histórica antes de sumar (Task 2, delegado a `consolidarIndicadoresPorNegocio`,
// Story 5.1-5.3). AC2: saldos/deudas/CxC también se convierten antes de
// sumar. AC3: excluye negocios archivados salvo `incluirArchivados: true`.
//
// Nota honesta: no se modela "cuentas por pagar" además de tarjeta — no
// existe una entidad `CuentaPorPagar` en el data model de este proyecto
// (mismo hallazgo documentado en Story 4.2, `CREDITO_PROVEEDOR` no tiene
// ledger propio).
//
// Nota de diseño: la "moneda operativa" de un negocio (para saber qué tasa
// aplicarle a sus indicadores) se infiere de la venta o gasto más reciente
// del período — Story 5.1 no rastrea moneda por línea dentro de un mismo
// negocio, así que esta story hereda esa simplificación en vez de
// reescribir el motor de cálculo de indicadores (fuera de alcance).
export const obtenerDashboardConsolidado = withErrorHandling(
  async (periodo: unknown, incluirArchivados = false): Promise<DashboardConsolidado> => {
    const parsedPeriodo = periodoFiltroSchema.parse(periodo);
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    return withRlsContextConsolidado(cuenta.id, async (tx) => {
      const negocios = await tx.negocio.findMany({
        where: { cuentaId: cuenta.id, ...(incluirArchivados ? {} : { estado: "ACTIVO" }) },
      });

      const negociosConsolidables = [];
      for (const negocio of negocios) {
        const monedaBase = await tx.moneda.findFirst({
          where: { negocioId: negocio.id, esBase: true },
        });

        const ventas = await tx.venta.findMany({
          where: {
            negocioId: negocio.id,
            fecha: { gte: parsedPeriodo.desde, lte: parsedPeriodo.hasta },
          },
          include: { ventaItems: { include: { item: true } } },
          orderBy: { fecha: "asc" },
        });
        const gastos = await tx.gasto.findMany({
          where: {
            negocioId: negocio.id,
            fecha: { gte: parsedPeriodo.desde, lte: parsedPeriodo.hasta },
          },
          include: { tipoGasto: true },
          orderBy: { fecha: "asc" },
        });

        const indicadoresNativos = calcularIndicadores({
          ventas: ventas.map((v) => ({
            estado: v.estado as Venta["estado"],
            impuesto: v.impuesto.toString(),
            items: v.ventaItems.map((vi) => ({
              itemTipo: vi.item.tipo as Item["tipo"],
              cantidad: vi.cantidad?.toString() ?? null,
              cantidadDevuelta: vi.cantidadDevuelta.toString(),
              precioUnitario: vi.precioUnitario.toString(),
              costoServicio: vi.costoServicio?.toString() ?? null,
              costoCompra: vi.item.costoCompra?.toString() ?? null,
            })),
          })),
          gastos: gastos.map((g) => ({
            monto: g.monto.toString(),
            clasificacion: g.tipoGasto.clasificacion as TipoGasto["clasificacion"],
          })),
        });

        const monedaOperativaId = ventas.at(-1)?.monedaId ?? gastos.at(-1)?.monedaId ?? null;
        const conversion =
          monedaOperativaId && monedaOperativaId !== monedaBase?.id
            ? await resolverConversion(tx, monedaOperativaId, parsedPeriodo.hasta)
            : { esMonedaBase: true, tasa: null };

        negociosConsolidables.push({
          negocioId: negocio.id,
          nombre: negocio.nombre,
          indicadores: indicadoresNativos,
          esMonedaBase: conversion.esMonedaBase,
          tasa: conversion.tasa,
        });
      }

      const { indicadoresConsolidados, porNegocio } =
        consolidarIndicadoresPorNegocio(negociosConsolidables);

      // AC2: saldos y deudas consolidados.
      const negocioIds = negocios.map((n) => n.id);
      const ahora = new Date();

      const cuentasFinancieras = await tx.cuentaFinanciera.findMany({
        where: { negocioId: { in: negocioIds } },
      });

      let totalCajaBanco = new Prisma.Decimal(0);
      let totalDeudaTarjetas = new Prisma.Decimal(0);
      for (const cf of cuentasFinancieras) {
        const conversion = await resolverConversion(tx, cf.monedaId, ahora);
        const enGuaranies = new Prisma.Decimal(
          convertirAGuaranies({
            monto: cf.saldoActual.toString(),
            esMonedaBase: conversion.esMonedaBase,
            tasa: conversion.tasa,
          })
        );

        if (cf.tipo === "TARJETA") {
          totalDeudaTarjetas = totalDeudaTarjetas.plus(enGuaranies.abs());
        } else {
          totalCajaBanco = totalCajaBanco.plus(enGuaranies);
        }
      }

      const cuentasPorCobrar = await tx.cuentaPorCobrar.findMany({
        where: { negocioId: { in: negocioIds }, estado: { not: "PAGADO" } },
        include: { venta: true },
      });

      let totalCuentasPorCobrar = new Prisma.Decimal(0);
      for (const cxc of cuentasPorCobrar) {
        const pendiente = cxc.montoOriginal.minus(cxc.montoPagado);
        const conversion = await resolverConversion(tx, cxc.venta.monedaId, ahora);
        const enGuaranies = convertirAGuaranies({
          monto: pendiente.toString(),
          esMonedaBase: conversion.esMonedaBase,
          tasa: conversion.tasa,
        });
        totalCuentasPorCobrar = totalCuentasPorCobrar.plus(enGuaranies);
      }

      return {
        indicadoresConsolidados,
        porNegocio,
        saldos: {
          totalCajaBanco: totalCajaBanco.toString(),
          totalDeudaTarjetas: totalDeudaTarjetas.toString(),
          totalCuentasPorCobrar: totalCuentasPorCobrar.toString(),
        },
      };
    });
  }
);
