import type { Item, TipoGasto, Venta } from "@repo/domain";
import {
  calcularIndicadores,
  calcularMontoRetiroPorRegla,
  debeAplicarAporteReserva,
  debeAplicarRegla,
  periodoMensualDe,
  rangoDelPeriodoMensual,
} from "@repo/domain";
import { aplicarMovimientoCuenta, withRlsContext } from "@repo/database";
import { createAdminClient } from "@/lib/supabase/admin";

// Story 6.2 Task 2 (retiro por regla) + Story 6.5 Task 1 (aporte a
// reserva) / ADR-001. Nota de organización: el story sugiere
// `ejecutarCierreDePeriodo` dentro de `packages/domain` — se implementa acá
// en cambio (deviación documentada, mismo criterio que la ubicación de
// `withRlsContextConsolidado` en Story 5.4) porque el paquete `domain` de
// este proyecto es deliberadamente puro (cero dependencias de Prisma/DB en
// cualquier otro archivo) y esta función necesita transacciones reales y el
// cliente Admin de Supabase. La parte pura del cálculo
// (`calcularMontoRetiroPorRegla`, `debeAplicarRegla`, `debeAplicarAporteReserva`,
// `periodoMensualDe`, `rangoDelPeriodoMensual`) sí vive en `packages/domain`,
// testeada ahí sin infraestructura.
export interface ResultadoCierreDePeriodo {
  cuentasProcesadas: number;
  retirosGenerados: number;
  aportesReservaGenerados: number;
  errores: { cuentaId: string; negocioId?: string; message: string }[];
}

// Enumera todas las cuentas del sistema vía Auth Admin API (paginado) —
// única forma de listar cuentas cross-tenant sin bypasear RLS a nivel de
// datos (ver `lib/supabase/admin.ts`).
async function listarTodasLasCuentaIds(): Promise<string[]> {
  const admin = createAdminClient();
  const ids: string[] = [];
  let page = 1;
  const perPage = 200;

  // Guarda de seguridad: nunca más de 100 páginas (20.000 cuentas) por
  // corrida — evita un loop infinito si la API cambia su contrato de
  // paginación.
  for (let i = 0; i < 100; i++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`No se pudo listar cuentas: ${error.message}`);

    ids.push(...data.users.map((u) => u.id));
    if (data.users.length < perPage) break;
    page++;
  }

  return ids;
}

// AC2 (Story 6.2): por cada negocio activo con `ReglaRetiro` vigente y no
// aplicada todavía en este período, genera el `RetiroUtilidad` (`origen:
// 'REGLA'`) y reduce la primera cuenta CAJA/BANCO del negocio (el AC no
// especifica cómo elegir entre varias cuentas cuando hay más de una — a
// diferencia del retiro manual de Story 6.1, acá no hay usuario en el loop
// para elegir; se usa la más antigua, de forma determinística y
// documentada). AC1 (Story 6.5, ADR-001 punto 7): además, por cada cuenta
// con `ReservaFinanciera.aportePorPeriodo > 0` no aplicada todavía en este
// período, suma ese aporte a `progresoAcumulado` — simétrico al retiro por
// regla, pero a nivel de cuenta (Personal), no de negocio.
export async function ejecutarCierreDePeriodo(fecha: Date): Promise<ResultadoCierreDePeriodo> {
  const periodoActual = periodoMensualDe(fecha);
  const { desde, hasta } = rangoDelPeriodoMensual(fecha);

  const cuentaIds = await listarTodasLasCuentaIds();
  let retirosGenerados = 0;
  let aportesReservaGenerados = 0;
  const errores: ResultadoCierreDePeriodo["errores"] = [];

  for (const cuentaId of cuentaIds) {
    try {
      const generadoAporte = await withRlsContext(cuentaId, null, async (tx) => {
        const reserva = await tx.reservaFinanciera.findUnique({ where: { cuentaId } });
        if (!reserva) return false;
        if (
          !debeAplicarAporteReserva(
            {
              aportePorPeriodo: reserva.aportePorPeriodo.toString(),
              ultimoPeriodoAplicado: reserva.ultimoPeriodoAplicado,
            },
            periodoActual
          )
        ) {
          return false;
        }

        await tx.reservaFinanciera.update({
          where: { id: reserva.id },
          data: {
            progresoAcumulado: { increment: reserva.aportePorPeriodo },
            ultimoPeriodoAplicado: periodoActual,
          },
        });
        return true;
      });

      if (generadoAporte) aportesReservaGenerados++;
    } catch (e) {
      errores.push({ cuentaId, message: e instanceof Error ? e.message : "Unknown error" });
    }

    try {
      const negocios = await withRlsContext(cuentaId, null, (tx) =>
        tx.negocio.findMany({ where: { cuentaId, estado: "ACTIVO" } })
      );

      for (const negocio of negocios) {
        try {
          const generado = await withRlsContext(cuentaId, negocio.id, async (tx) => {
            const regla = await tx.reglaRetiro.findUnique({ where: { negocioId: negocio.id } });
            if (!regla) return false;
            if (
              !debeAplicarRegla(
                { activa: regla.activa, ultimoPeriodoAplicado: regla.ultimoPeriodoAplicado },
                periodoActual
              )
            ) {
              return false;
            }

            const cuentaOrigen = await tx.cuentaFinanciera.findFirst({
              where: { negocioId: negocio.id, tipo: { in: ["CAJA", "BANCO"] } },
              orderBy: { createdAt: "asc" },
            });
            if (!cuentaOrigen) return false;

            const [ventas, gastos] = await Promise.all([
              tx.venta.findMany({
                where: { negocioId: negocio.id, fecha: { gte: desde, lte: hasta } },
                include: { ventaItems: { include: { item: true } } },
              }),
              tx.gasto.findMany({
                where: { negocioId: negocio.id, fecha: { gte: desde, lte: hasta } },
                include: { tipoGasto: true },
              }),
            ]);

            const indicadores = calcularIndicadores({
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

            const monto = calcularMontoRetiroPorRegla(
              { tipo: regla.tipo as "PORCENTAJE" | "MONTO_FIJO", valor: regla.valor.toString() },
              indicadores.gananciaLiquida
            );

            // La tabla exige monto > 0 — una regla PORCENTAJE sobre un
            // período con ganancia líquida nula o negativa no genera retiro
            // (pero sí actualiza `ultimoPeriodoAplicado`, evitando
            // reintentos infinitos del cron sobre el mismo período).
            const generaRetiro = Number(monto) > 0;

            if (generaRetiro) {
              const nuevoRetiro = await tx.retiroUtilidad.create({
                data: {
                  cuentaId,
                  negocioId: negocio.id,
                  monto,
                  fecha,
                  origen: "REGLA",
                  reglaId: regla.id,
                },
              });

              await aplicarMovimientoCuenta(tx, {
                cuentaFinancieraId: cuentaOrigen.id,
                tipo: "EGRESO",
                monto,
                referenciaTipo: "RETIRO",
                referenciaId: nuevoRetiro.id,
              });
            }

            await tx.reglaRetiro.update({
              where: { id: regla.id },
              data: { ultimoPeriodoAplicado: periodoActual },
            });

            return generaRetiro;
          });

          if (generado) retirosGenerados++;
        } catch (e) {
          errores.push({
            cuentaId,
            negocioId: negocio.id,
            message: e instanceof Error ? e.message : "Unknown error",
          });
        }
      }
    } catch (e) {
      errores.push({ cuentaId, message: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  return {
    cuentasProcesadas: cuentaIds.length,
    retirosGenerados,
    aportesReservaGenerados,
    errores,
  };
}
