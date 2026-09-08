"use server";

import type { Gasto, GastoFijo, Moneda, TipoGasto } from "@repo/domain";
import { obtenerClasificacionGasto } from "@repo/domain";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

export type GastoListado = Gasto & {
  tipoGastoNombre: string;
  clasificacion: TipoGasto["clasificacion"];
};

export interface GastosPageData {
  gastos: GastoListado[];
  tiposGasto: TipoGasto[];
  monedas: Moneda[];
  gastosFijos: GastoFijo[];
}

// Consolida en UNA sola transacción los 4 listados que la página de Gastos
// pedía en Server Actions independientes (listarGastos, listarTiposGasto,
// listarMonedas, listarGastosFijos) — mismo criterio que `obtenerDashboard`:
// cada una pagaba su propio handshake de RLS contra Supabase (remoto), y
// tiposGasto/monedas se pedían duplicados entre componentes hermanos
// (GastoForm, GastosLista, TipoGastoCatalogo y GastoFijoPanel pedían cada uno
// el suyo). [Optimización de rendimiento, ver feedback de sesión]
export const obtenerGastosPageData = withErrorHandling(
  async (negocioId: string): Promise<GastosPageData> => {
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    return withRlsContext(cuenta.id, negocioId, async (tx) => {
      const [gastosRaw, tiposGastoRaw, monedasRaw, gastosFijosRaw] = await Promise.all([
        tx.gasto.findMany({
          where: { cuentaId: cuenta.id, negocioId },
          include: { tipoGasto: true },
          orderBy: { fecha: "desc" },
        }),
        tx.tipoGasto.findMany({
          where: { cuentaId: cuenta.id, negocioId },
          orderBy: { createdAt: "asc" },
        }),
        tx.moneda.findMany({
          where: { cuentaId: cuenta.id, negocioId },
          orderBy: { createdAt: "asc" },
        }),
        tx.gastoFijo.findMany({
          where: { cuentaId: cuenta.id, negocioId },
          orderBy: { createdAt: "asc" },
        }),
      ]);

      const gastos: GastoListado[] = gastosRaw.map((g) => ({
        id: g.id,
        cuentaId: g.cuentaId,
        negocioId: g.negocioId,
        ambito: g.ambito as Gasto["ambito"],
        tipoGastoId: g.tipoGastoId,
        monto: g.monto.toString(),
        monedaId: g.monedaId,
        fecha: g.fecha,
        formaPago: g.formaPago as Gasto["formaPago"],
        cuentaFinancieraId: g.cuentaFinancieraId,
        tipoGastoNombre: g.tipoGasto.nombre,
        clasificacion: obtenerClasificacionGasto({
          clasificacion: g.tipoGasto.clasificacion as TipoGasto["clasificacion"],
        }),
      }));

      const tiposGasto: TipoGasto[] = tiposGastoRaw.map((t) => ({
        id: t.id,
        cuentaId: t.cuentaId,
        negocioId: t.negocioId,
        ambito: t.ambito as TipoGasto["ambito"],
        nombre: t.nombre,
        clasificacion: t.clasificacion as TipoGasto["clasificacion"],
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

      const gastosFijos: GastoFijo[] = gastosFijosRaw.map((g) => ({
        id: g.id,
        cuentaId: g.cuentaId,
        negocioId: g.negocioId,
        nombre: g.nombre,
        monto: g.monto.toString(),
        monedaId: g.monedaId,
        activo: g.activo,
      }));

      return { gastos, tiposGasto, monedas, gastosFijos };
    });
  }
);
