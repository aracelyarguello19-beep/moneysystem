"use server";

import { Prisma } from "@prisma/client";
import type { BalancePersonal, TipoGasto } from "@repo/domain";
import { calcularBalancePersonal } from "@repo/domain";
import { periodoFiltroSchema } from "@repo/domain/schemas";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// AC2/AC3/AC4: retiros de TODOS los negocios de la cuenta en el período
// (`retiroUtilidad.findMany` sin filtrar por `negocioId`) apoyándose en la
// policy "relajada" de `retiros_utilidad` (Story 6.1, Dev Notes) — esta
// acción NO usa `withRlsContextConsolidado` (Story 5.4): sería una
// violación de "Bypass Consolidado Restringido" (Coding Standards) para
// una tabla que ya permite esta lectura sin bypass.
export const obtenerBalancePersonal = withErrorHandling(
  async (periodo: unknown): Promise<BalancePersonal> => {
    const parsedPeriodo = periodoFiltroSchema.parse(periodo);
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    return withRlsContext(cuenta.id, null, async (tx) => {
      const [retiros, gastos, reserva, tarjetas] = await Promise.all([
        tx.retiroUtilidad.findMany({
          where: {
            cuentaId: cuenta.id,
            fecha: { gte: parsedPeriodo.desde, lte: parsedPeriodo.hasta },
          },
        }),
        tx.gasto.findMany({
          where: {
            cuentaId: cuenta.id,
            ambito: "PERSONAL",
            fecha: { gte: parsedPeriodo.desde, lte: parsedPeriodo.hasta },
          },
          include: { tipoGasto: true },
        }),
        tx.reservaFinanciera.findUnique({ where: { cuentaId: cuenta.id } }),
        tx.cuentaFinanciera.findMany({
          where: { cuentaId: cuenta.id, negocioId: null, tipo: "TARJETA" },
        }),
      ]);

      const gastosFijos = gastos
        .filter((g) => (g.tipoGasto.clasificacion as TipoGasto["clasificacion"]) === "FIJO")
        .map((g) => g.monto.toString());
      const gastosVariables = gastos
        .filter((g) => (g.tipoGasto.clasificacion as TipoGasto["clasificacion"]) === "VARIABLE")
        .map((g) => g.monto.toString());

      const deudaTarjetaPersonal = tarjetas
        .reduce((acc, t) => acc.plus(t.saldoActual.abs()), new Prisma.Decimal(0))
        .toString();

      return calcularBalancePersonal({
        retiros: retiros.map((r) => ({ negocioId: r.negocioId, monto: r.monto.toString() })),
        gastosFijos,
        gastosVariables,
        aporteReserva: reserva?.aportePorPeriodo.toString() ?? "0",
        deudaTarjetaPersonal,
      });
    });
  }
);
