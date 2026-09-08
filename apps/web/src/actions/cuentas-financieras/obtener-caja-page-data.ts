"use server";

import type { CuentaFinanciera, Moneda, TipoGasto } from "@repo/domain";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";
import type { MonedaConTasa } from "@/actions/catalogos/listar-tasas-cambio";

export interface CajaPageData {
  cuentas: CuentaFinanciera[];
  monedas: Moneda[];
  tasas: MonedaConTasa[];
  tiposGasto: TipoGasto[];
}

// Consolida en UNA sola transacción los 4 listados que CajaPanel pedía en
// Server Actions independientes (listarCuentasFinancieras, listarMonedas,
// listarTasasCambio, listarTiposGasto) — mismo criterio que
// `obtenerGastosPageData`/`obtenerDashboard`: cada una pagaba su propio
// handshake de RLS (BEGIN + 2× set_config + verificación de pertenencia del
// negocio) contra Supabase, que es remoto. De paso reemplaza el N+1 que
// tenía `listarTasasCambio` (un `findFirst` por moneda no base dentro de un
// loop) por una sola consulta con `in` + Map, igual que ya hace
// `obtenerDashboard` para el mismo dato. [Optimización de rendimiento, ver
// feedback de sesión]
export const obtenerCajaPageData = withErrorHandling(
  async (negocioId: string): Promise<CajaPageData> => {
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    return withRlsContext(cuenta.id, negocioId, async (tx) => {
      const [cuentasRaw, monedasRaw, tiposGastoRaw] = await Promise.all([
        tx.cuentaFinanciera.findMany({
          where: { cuentaId: cuenta.id, negocioId },
          orderBy: { createdAt: "asc" },
        }),
        tx.moneda.findMany({
          where: { cuentaId: cuenta.id, negocioId },
          orderBy: { createdAt: "asc" },
        }),
        tx.tipoGasto.findMany({
          where: { cuentaId: cuenta.id, negocioId },
          orderBy: { createdAt: "asc" },
        }),
      ]);

      const cuentas: CuentaFinanciera[] = cuentasRaw.map((c) => ({
        id: c.id,
        cuentaId: c.cuentaId,
        negocioId: c.negocioId,
        tipo: c.tipo as CuentaFinanciera["tipo"],
        nombre: c.nombre,
        banco: c.banco,
        alias: c.alias,
        detalleOtro: c.detalleOtro,
        monedaId: c.monedaId,
        saldoActual: c.saldoActual.toString(),
        limiteCredito: c.limiteCredito?.toString() ?? null,
      }));

      const monedas: Moneda[] = monedasRaw.map((m) => ({
        id: m.id,
        cuentaId: m.cuentaId,
        negocioId: m.negocioId,
        ambito: m.ambito as Moneda["ambito"],
        codigo: m.codigo,
        nombre: m.nombre,
        esBase: m.esBase,
        activa: m.activa,
      }));

      const tiposGasto: TipoGasto[] = tiposGastoRaw.map((t) => ({
        id: t.id,
        cuentaId: t.cuentaId,
        negocioId: t.negocioId,
        ambito: t.ambito as TipoGasto["ambito"],
        nombre: t.nombre,
        clasificacion: t.clasificacion as TipoGasto["clasificacion"],
      }));

      // Tasa vigente por moneda no base activa — una sola consulta con `in`
      // para todas las monedas en vez del `findFirst` por moneda de
      // `listarTasasCambio` (N+1: ida y vuelta extra por cada moneda
      // extranjera del negocio).
      const monedasNoBaseActivas = monedas.filter((m) => !m.esBase && m.activa);
      const monedaIds = monedasNoBaseActivas.map((m) => m.id);
      const tasasRaw =
        monedaIds.length > 0
          ? await tx.tasaCambio.findMany({
              where: { monedaId: { in: monedaIds } },
              orderBy: { vigenteDesde: "desc" },
            })
          : [];
      const tasaVigentePorMoneda = new Map<string, (typeof tasasRaw)[number]>();
      for (const t of tasasRaw) {
        if (!tasaVigentePorMoneda.has(t.monedaId)) tasaVigentePorMoneda.set(t.monedaId, t);
      }

      const tasas: MonedaConTasa[] = monedasNoBaseActivas.map((m) => {
        const t = tasaVigentePorMoneda.get(m.id);
        return {
          moneda: m,
          tasaVigente: t
            ? {
                id: t.id,
                monedaId: t.monedaId,
                tasa: t.tasa.toString(),
                vigenteDesde: t.vigenteDesde,
                registradaPor: t.registradaPor,
              }
            : null,
        };
      });

      return { cuentas, monedas, tasas, tiposGasto };
    });
  }
);
