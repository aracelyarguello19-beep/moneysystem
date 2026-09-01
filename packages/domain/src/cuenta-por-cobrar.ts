import Decimal from "decimal.js";

export type EstadoCxC = "PENDIENTE" | "PARCIAL" | "PAGADO";

// [Source: architecture/data-models.md#CuentaPorCobrar / PagoCxC]
export interface CuentaPorCobrar {
  id: string;
  negocioId: string;
  ventaId: string;
  cliente: string;
  montoOriginal: string;
  montoPagado: string;
  estado: EstadoCxC;
}

export interface PagoCxC {
  id: string;
  cuentaPorCobrarId: string;
  monto: string;
  fecha: Date;
  cuentaFinancieraId: string; // dónde entró el cobro
}

// AC2: PENDIENTE → PARCIAL → PAGADO según cuánto se pagó acumulado. También
// se reutiliza cuando `montoOriginal` baja por una devolución (Story 3.3):
// si queda en 0, "no debe nada más" se modela igual como PAGADO — el enum no
// tiene un estado "CANCELADA" propio en el data model documentado.
export function calcularEstadoCxC(montoOriginal: string, montoPagado: string): EstadoCxC {
  const original = new Decimal(montoOriginal);
  const pagado = new Decimal(montoPagado);
  if (pagado.greaterThanOrEqualTo(original)) return "PAGADO";
  if (pagado.greaterThan(0)) return "PARCIAL";
  return "PENDIENTE";
}

// AC3: total adeudado agregado = suma de (montoOriginal - montoPagado) de
// las cuentas que todavía no están PAGADO.
export function calcularTotalAdeudado(cuentas: Pick<CuentaPorCobrar, "montoOriginal" | "montoPagado" | "estado">[]): string {
  const total = cuentas
    .filter((c) => c.estado !== "PAGADO")
    .reduce(
      (acc, c) => acc.plus(new Decimal(c.montoOriginal).minus(c.montoPagado)),
      new Decimal(0)
    );

  return total.toString();
}

export class PagoExcedeSaldoError extends Error {
  constructor() {
    super("El pago excede el saldo pendiente de la cuenta por cobrar.");
    this.name = "PagoExcedeSaldoError";
  }
}

// AC2: no se puede registrar un pago mayor a lo que todavía se debe.
export function assertPagoValido(
  cxc: Pick<CuentaPorCobrar, "montoOriginal" | "montoPagado">,
  monto: string
): void {
  const pendiente = new Decimal(cxc.montoOriginal).minus(cxc.montoPagado);
  if (new Decimal(monto).greaterThan(pendiente)) {
    throw new PagoExcedeSaldoError();
  }
}
