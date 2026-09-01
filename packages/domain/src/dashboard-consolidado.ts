import type { ConsolidadoIndicadores } from "./indicadores/consolidado";

// AC2 (Story 5.4): caja + bancos, deuda de tarjetas, y cuentas por cobrar,
// sumados entre todos los negocios de la cuenta, ya convertidos a
// Guaraníes. No incluye "cuentas por pagar" más allá de tarjeta: no existe
// una entidad `CuentaPorPagar` en el data model del proyecto (a diferencia
// de `CuentaPorCobrar`) — mismo hallazgo ya documentado en Story 4.2.
export interface SaldosConsolidados {
  totalCajaBanco: string;
  totalDeudaTarjetas: string; // valor absoluto — saldoActual de una tarjeta es negativo
  totalCuentasPorCobrar: string;
}

export interface DashboardConsolidado extends ConsolidadoIndicadores {
  saldos: SaldosConsolidados;
}
