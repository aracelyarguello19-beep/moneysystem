import { describe, expect, it } from "vitest";
import {
  agruparSaldosPorMoneda,
  assertCuentaFinancieraEsTarjeta,
  assertCuentaFinancieraNoEsTarjeta,
  CuentaFinancieraTipoInvalidoError,
  signoMovimientoCuenta,
  signoMovimientoTarjeta,
  type CuentaFinanciera,
} from "./cuenta-financiera";

function cuenta(overrides: Partial<CuentaFinanciera>): CuentaFinanciera {
  return {
    id: "id",
    cuentaId: "cuenta-1",
    negocioId: "negocio-1",
    tipo: "CAJA",
    nombre: "Caja",
    banco: null,
    alias: null,
    detalleOtro: null,
    monedaId: "moneda-1",
    saldoActual: "0",
    limiteCredito: null,
    ...overrides,
  };
}

describe("agruparSaldosPorMoneda", () => {
  it("agrupa cuentas por monedaId sin sumar montos de monedas distintas", () => {
    const grupos = agruparSaldosPorMoneda([
      cuenta({ id: "a", monedaId: "PYG", saldoActual: "100" }),
      cuenta({ id: "b", monedaId: "USD", saldoActual: "50" }),
      cuenta({ id: "c", monedaId: "PYG", saldoActual: "200" }),
    ]);

    expect(Object.keys(grupos).sort()).toEqual(["PYG", "USD"]);
    expect(grupos.PYG).toHaveLength(2);
    expect(grupos.USD).toHaveLength(1);
    // Nunca se suman entre sí — cada cuenta conserva su propio saldoActual.
    expect(grupos.PYG.map((c) => c.saldoActual)).toEqual(["100", "200"]);
  });

  it("devuelve un objeto vacío para una lista vacía", () => {
    expect(agruparSaldosPorMoneda([])).toEqual({});
  });
});

describe("signoMovimientoCuenta", () => {
  it("INGRESO suma al saldo", () => {
    expect(signoMovimientoCuenta("INGRESO")).toBe(1);
  });

  it("EGRESO resta del saldo", () => {
    expect(signoMovimientoCuenta("EGRESO")).toBe(-1);
  });
});

describe("signoMovimientoTarjeta", () => {
  it("CONSUMO aumenta la deuda (resta saldo)", () => {
    expect(signoMovimientoTarjeta("CONSUMO")).toBe(-1);
  });

  it("INTERES aumenta la deuda (resta saldo)", () => {
    expect(signoMovimientoTarjeta("INTERES")).toBe(-1);
  });

  it("PAGO_RESUMEN reduce la deuda (suma saldo)", () => {
    expect(signoMovimientoTarjeta("PAGO_RESUMEN")).toBe(1);
  });
});

describe("assertCuentaFinancieraEsTarjeta", () => {
  it("no lanza para TARJETA", () => {
    expect(() => assertCuentaFinancieraEsTarjeta({ tipo: "TARJETA" })).not.toThrow();
  });

  it("lanza para CAJA/BANCO", () => {
    expect(() => assertCuentaFinancieraEsTarjeta({ tipo: "CAJA" })).toThrow(
      CuentaFinancieraTipoInvalidoError
    );
    expect(() => assertCuentaFinancieraEsTarjeta({ tipo: "BANCO" })).toThrow(
      CuentaFinancieraTipoInvalidoError
    );
  });
});

describe("assertCuentaFinancieraNoEsTarjeta", () => {
  it("no lanza para CAJA/BANCO", () => {
    expect(() => assertCuentaFinancieraNoEsTarjeta({ tipo: "CAJA" })).not.toThrow();
    expect(() => assertCuentaFinancieraNoEsTarjeta({ tipo: "BANCO" })).not.toThrow();
  });

  it("lanza para TARJETA", () => {
    expect(() => assertCuentaFinancieraNoEsTarjeta({ tipo: "TARJETA" })).toThrow(
      CuentaFinancieraTipoInvalidoError
    );
  });
});
