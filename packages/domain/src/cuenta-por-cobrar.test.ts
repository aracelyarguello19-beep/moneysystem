import { describe, expect, it } from "vitest";
import {
  assertCuentaPorCobrarSinPagos,
  assertMontoOriginalValido,
  assertPagoValido,
  calcularEstadoCxC,
  calcularTotalAdeudado,
  CuentaPorCobrarConPagosError,
  MontoOriginalMenorAPagadoError,
  PagoExcedeSaldoError,
} from "./cuenta-por-cobrar";

describe("calcularEstadoCxC", () => {
  it("devuelve PENDIENTE cuando no se pagó nada", () => {
    expect(calcularEstadoCxC("100.00", "0")).toBe("PENDIENTE");
  });

  it("devuelve PARCIAL cuando se pagó una parte", () => {
    expect(calcularEstadoCxC("100.00", "40.00")).toBe("PARCIAL");
  });

  it("devuelve PAGADO cuando se pagó el total", () => {
    expect(calcularEstadoCxC("100.00", "100.00")).toBe("PAGADO");
  });

  it("devuelve PAGADO cuando el monto original queda en 0 (devolución total)", () => {
    expect(calcularEstadoCxC("0", "0")).toBe("PAGADO");
  });
});

describe("calcularTotalAdeudado", () => {
  it("suma el saldo pendiente de las cuentas no pagadas", () => {
    const total = calcularTotalAdeudado([
      { montoOriginal: "100.00", montoPagado: "40.00", estado: "PARCIAL" },
      { montoOriginal: "50.00", montoPagado: "0", estado: "PENDIENTE" },
      { montoOriginal: "30.00", montoPagado: "30.00", estado: "PAGADO" },
    ]);
    expect(total).toBe("110");
  });

  it("devuelve '0' cuando no hay cuentas pendientes", () => {
    expect(calcularTotalAdeudado([])).toBe("0");
  });
});

describe("assertPagoValido", () => {
  it("no lanza cuando el pago está dentro del saldo pendiente", () => {
    expect(() =>
      assertPagoValido({ montoOriginal: "100.00", montoPagado: "40.00" }, "60.00")
    ).not.toThrow();
  });

  it("lanza cuando el pago excede el saldo pendiente", () => {
    expect(() =>
      assertPagoValido({ montoOriginal: "100.00", montoPagado: "40.00" }, "70.00")
    ).toThrow(PagoExcedeSaldoError);
  });
});

describe("assertMontoOriginalValido", () => {
  it("no lanza cuando el nuevo monto sigue cubriendo lo ya pagado", () => {
    expect(() => assertMontoOriginalValido({ montoPagado: "40.00" }, "100.00")).not.toThrow();
  });

  it("no lanza cuando el nuevo monto es igual a lo ya pagado", () => {
    expect(() => assertMontoOriginalValido({ montoPagado: "40.00" }, "40.00")).not.toThrow();
  });

  it("lanza cuando el nuevo monto queda por debajo de lo ya pagado", () => {
    expect(() => assertMontoOriginalValido({ montoPagado: "40.00" }, "30.00")).toThrow(
      MontoOriginalMenorAPagadoError
    );
  });
});

describe("assertCuentaPorCobrarSinPagos", () => {
  it("no lanza cuando no se registró ningún pago", () => {
    expect(() => assertCuentaPorCobrarSinPagos({ montoPagado: "0" })).not.toThrow();
  });

  it("lanza cuando ya tiene algún pago registrado", () => {
    expect(() => assertCuentaPorCobrarSinPagos({ montoPagado: "40.00" })).toThrow(
      CuentaPorCobrarConPagosError
    );
  });
});
