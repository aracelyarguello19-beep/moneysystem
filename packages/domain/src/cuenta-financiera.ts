// Modelo unificado de Caja, Cuenta Bancaria y Tarjeta de Crédito — un solo
// concepto ("medio de pago con saldo/deuda") en vez de tres tablas
// paralelas. [Source: architecture/data-models.md#CuentaFinanciera]
export type TipoCuentaFinanciera = "CAJA" | "BANCO" | "TARJETA";

export interface CuentaFinanciera {
  id: string;
  cuentaId: string;
  negocioId: string | null; // null = Personal, ver Epic 6
  ambito: "LABORAL" | "PERSONAL";
  tipo: TipoCuentaFinanciera;
  nombre: string;
  monedaId: string;
  saldoActual: string; // Tarjeta: negativo = deuda
  limiteCredito: string | null;
}

export type TipoMovimientoCuenta = "INGRESO" | "EGRESO";
export type ReferenciaMovimientoCuenta =
  | "COMPRA"
  | "VENTA"
  | "GASTO"
  | "PAGO_CXC"
  | "RETIRO"
  | "MANUAL"
  | null;

// [Source: architecture/data-models.md#MovimientoTarjeta / MovimientoCuenta]
export interface MovimientoCuenta {
  id: string;
  cuentaFinancieraId: string;
  tipo: TipoMovimientoCuenta;
  monto: string;
  fecha: Date;
  referenciaTipo: ReferenciaMovimientoCuenta;
  referenciaId: string | null;
}

export type TipoMovimientoTarjeta = "CONSUMO" | "PAGO_RESUMEN" | "INTERES";
export type ReferenciaMovimientoTarjeta = "COMPRA" | "GASTO" | "MANUAL" | null;

export interface MovimientoTarjeta {
  id: string;
  cuentaFinancieraId: string; // debe ser tipo TARJETA
  tipo: TipoMovimientoTarjeta;
  monto: string;
  fecha: Date;
  referenciaTipo: ReferenciaMovimientoTarjeta;
  referenciaId: string | null;
}

// AC1 (Story 4.2): el signo del delta aplicado a `saldoActual` según el
// tipo de movimiento — función pura, testeable sin infraestructura.
// `aplicarMovimientoCuenta` (packages/database) la usa para no lanzar
// aritmética de signos suelta en la capa de datos.
export function signoMovimientoCuenta(tipo: TipoMovimientoCuenta): 1 | -1 {
  return tipo === "INGRESO" ? 1 : -1;
}

// AC1 (Story 4.2): `saldoActual` de una tarjeta es negativo = deuda.
// CONSUMO/INTERES aumentan la deuda (restan saldo); PAGO_RESUMEN la reduce
// (suma saldo).
export function signoMovimientoTarjeta(tipo: TipoMovimientoTarjeta): 1 | -1 {
  return tipo === "PAGO_RESUMEN" ? 1 : -1;
}

// AC3 (Story 4.3): el "saldo por moneda" es agrupar filas existentes por
// `monedaId` — nunca sumar montos de monedas distintas entre sí (eso
// requeriría conversión, responsabilidad de Epic 5, no de esta función).
export function agruparSaldosPorMoneda(
  cuentas: CuentaFinanciera[]
): Record<string, CuentaFinanciera[]> {
  return cuentas.reduce<Record<string, CuentaFinanciera[]>>((acc, cuenta) => {
    (acc[cuenta.monedaId] ??= []).push(cuenta);
    return acc;
  }, {});
}

export class CuentaFinancieraTipoInvalidoError extends Error {
  constructor(esperado: TipoCuentaFinanciera) {
    super(`La cuenta financiera debe ser de tipo ${esperado}.`);
    this.name = "CuentaFinancieraTipoInvalidoError";
  }
}

export function assertCuentaFinancieraEsTarjeta(cf: Pick<CuentaFinanciera, "tipo">): void {
  if (cf.tipo !== "TARJETA") {
    throw new CuentaFinancieraTipoInvalidoError("TARJETA");
  }
}

// Un pago (efectivo/banco/tarjeta ajeno) nunca debe apuntar a una cuenta
// tipo TARJETA como origen de fondos — TARJETA es un pasivo, no liquidez.
export function assertCuentaFinancieraNoEsTarjeta(cf: Pick<CuentaFinanciera, "tipo">): void {
  if (cf.tipo === "TARJETA") {
    throw new CuentaFinancieraTipoInvalidoError("CAJA");
  }
}
