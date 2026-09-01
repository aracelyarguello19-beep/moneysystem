import Decimal from "decimal.js";
import { sumarRetiros, type RetiroUtilidad } from "./retiro-utilidad";

export interface RetiroPorNegocio {
  negocioId: string;
  total: string;
}

// AC2 (Story 6.5): fórmula literal del epic — disponible = retiros
// recibidos − gastos fijos − gastos varios − aporte a reserva. No incluye
// un término de gastos financieros (Story 6.4/ADR-002): un interés de
// tarjeta personal no se resta acá — no se inventa un cuarto término no
// pedido por el AC (Article IV, No Invention; ver Dev Notes de la story).
export interface BalancePersonal {
  totalRetiros: string;
  gastosFijos: string;
  gastosVariables: string;
  aporteReserva: string;
  disponible: string;
  // AC3: desglose de retiros por negocio de origen.
  retirosPorNegocio: RetiroPorNegocio[];
  // AC4: deuda de tarjeta personal — pasivo separado, NUNCA restado del
  // `disponible` calculado arriba.
  deudaTarjetaPersonal: string;
}

function sumarMontos(montos: string[]): string {
  return montos.reduce((acc, m) => acc.plus(m), new Decimal(0)).toString();
}

export function calcularBalancePersonal(datos: {
  retiros: Pick<RetiroUtilidad, "negocioId" | "monto">[];
  gastosFijos: string[];
  gastosVariables: string[];
  aporteReserva: string;
  deudaTarjetaPersonal: string;
}): BalancePersonal {
  const totalRetiros = sumarRetiros(datos.retiros);
  const gastosFijos = sumarMontos(datos.gastosFijos);
  const gastosVariables = sumarMontos(datos.gastosVariables);

  const disponible = new Decimal(totalRetiros)
    .minus(gastosFijos)
    .minus(gastosVariables)
    .minus(datos.aporteReserva)
    .toString();

  const totalesPorNegocio = new Map<string, string>();
  for (const retiro of datos.retiros) {
    const acumulado = totalesPorNegocio.get(retiro.negocioId) ?? "0";
    totalesPorNegocio.set(retiro.negocioId, sumarMontos([acumulado, retiro.monto]));
  }

  return {
    totalRetiros,
    gastosFijos,
    gastosVariables,
    aporteReserva: datos.aporteReserva,
    disponible,
    retirosPorNegocio: Array.from(totalesPorNegocio.entries()).map(([negocioId, total]) => ({
      negocioId,
      total,
    })),
    deudaTarjetaPersonal: datos.deudaTarjetaPersonal,
  };
}
