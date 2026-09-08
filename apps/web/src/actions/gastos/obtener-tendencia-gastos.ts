"use server";

import { periodoFiltroSchema } from "@repo/domain/schemas";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

const NOMBRES_MES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// Mismo umbral/criterio que `obtenerDashboard` (Story rediseño Dashboard):
// más de un mes de rango, un punto por mes en vez de por día, si no el
// gráfico queda ilegible con "Este año" o rangos manuales largos.
const UMBRAL_DIAS_AGRUPACION_MENSUAL = 31;

export interface PuntoTendenciaGasto {
  clave: string;
  etiqueta: string;
  total: string;
}

export interface TendenciaGastos {
  puntos: PuntoTendenciaGasto[];
  total: string;
}

// Suma cruda de `monto` sin convertir por moneda — misma simplificación ya
// existente en `obtenerDashboard` (PuntoTendencia.gastos): este sistema no
// tiene todavía una cotización "vigente para el período" que permita sumar
// distintas monedas con sentido, así que el total es una cifra sin prefijo
// de moneda (ver `formatearMonto` sin `codigoMoneda`), no una conversión.
export const obtenerTendenciaGastos = withErrorHandling(
  async (negocioId: string, periodo: unknown): Promise<TendenciaGastos> => {
    const parsed = periodoFiltroSchema.parse(periodo);
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    const gastos = await withRlsContext(cuenta.id, negocioId, (tx) =>
      tx.gasto.findMany({
        where: { negocioId, fecha: { gte: parsed.desde, lte: parsed.hasta } },
        select: { monto: true, fecha: true, createdAt: true },
      })
    );

    const diasEnRango = Math.round((parsed.hasta.getTime() - parsed.desde.getTime()) / 86_400_000);
    const agruparPorMes = diasEnRango > UMBRAL_DIAS_AGRUPACION_MENSUAL;
    // "Hoy" (desde === hasta, un solo día): un punto por día no dice nada —
    // se agrupa por hora en su lugar, usando `createdAt` (el único campo con
    // hora real; `fecha` es `@db.Date`, sin componente de tiempo).
    const unSoloDia =
      diasEnRango === 0 &&
      parsed.desde.getUTCFullYear() === parsed.hasta.getUTCFullYear() &&
      parsed.desde.getUTCMonth() === parsed.hasta.getUTCMonth() &&
      parsed.desde.getUTCDate() === parsed.hasta.getUTCDate();

    const puntos: PuntoTendenciaGasto[] = [];

    // `fecha` es `@db.Date` — Prisma/zod la representan como medianoche UTC,
    // así que agrupar hay que hacerlo con los getters UTC (ver mismo
    // comentario en obtenerDashboard: con getters locales, cualquier huso
    // detrás de UTC corre el balde un día).
    if (unSoloDia) {
      for (let hora = 0; hora < 24; hora++) {
        const total = gastos
          .filter((g) => g.createdAt.getUTCHours() === hora)
          .reduce((acc, g) => acc + Number(g.monto), 0);

        puntos.push({
          clave: `${parsed.desde.toISOString().slice(0, 10)}T${String(hora).padStart(2, "0")}`,
          etiqueta: `${String(hora).padStart(2, "0")}:00`,
          total: total.toString(),
        });
      }
    } else if (agruparPorMes) {
      const inicio = new Date(Date.UTC(parsed.desde.getUTCFullYear(), parsed.desde.getUTCMonth(), 1));
      const fin = new Date(Date.UTC(parsed.hasta.getUTCFullYear(), parsed.hasta.getUTCMonth(), 1));
      for (const fecha = new Date(inicio); fecha <= fin; fecha.setUTCMonth(fecha.getUTCMonth() + 1)) {
        const total = gastos
          .filter(
            (g) => g.fecha.getUTCFullYear() === fecha.getUTCFullYear() && g.fecha.getUTCMonth() === fecha.getUTCMonth()
          )
          .reduce((acc, g) => acc + Number(g.monto), 0);

        puntos.push({
          clave: `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}`,
          etiqueta: NOMBRES_MES[fecha.getUTCMonth()],
          total: total.toString(),
        });
      }
    } else {
      const inicio = new Date(
        Date.UTC(parsed.desde.getUTCFullYear(), parsed.desde.getUTCMonth(), parsed.desde.getUTCDate())
      );
      const fin = new Date(Date.UTC(parsed.hasta.getUTCFullYear(), parsed.hasta.getUTCMonth(), parsed.hasta.getUTCDate()));
      for (const fecha = new Date(inicio); fecha <= fin; fecha.setUTCDate(fecha.getUTCDate() + 1)) {
        const total = gastos
          .filter(
            (g) =>
              g.fecha.getUTCFullYear() === fecha.getUTCFullYear() &&
              g.fecha.getUTCMonth() === fecha.getUTCMonth() &&
              g.fecha.getUTCDate() === fecha.getUTCDate()
          )
          .reduce((acc, g) => acc + Number(g.monto), 0);

        puntos.push({
          clave: fecha.toISOString().slice(0, 10),
          etiqueta: `${String(fecha.getUTCDate()).padStart(2, "0")}/${String(fecha.getUTCMonth() + 1).padStart(2, "0")}`,
          total: total.toString(),
        });
      }
    }

    const total = gastos.reduce((acc, g) => acc + Number(g.monto), 0);

    return { puntos, total: total.toString() };
  }
);
