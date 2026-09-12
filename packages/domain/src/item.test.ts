import { describe, expect, it } from "vitest";
import {
  assertCambioDeTipoPermitido,
  assertItemEliminable,
  assertStockSuficiente,
  calcularCostoPromedioPonderado,
  calcularGananciaProducto,
  ItemConMovimientosError,
  StockInsuficienteError,
  TipoItemBloqueadoError,
} from "./item";

describe("assertStockSuficiente", () => {
  it("no lanza cuando la cantidad pedida es menor al stock", () => {
    expect(() => assertStockSuficiente({ nombre: "Zapatilla", stockActual: "5" }, "3")).not.toThrow();
  });

  it("no lanza cuando la cantidad pedida es igual al stock", () => {
    expect(() => assertStockSuficiente({ nombre: "Zapatilla", stockActual: "1" }, "1")).not.toThrow();
  });

  it("lanza cuando la cantidad pedida supera el stock", () => {
    expect(() => assertStockSuficiente({ nombre: "Zapatilla", stockActual: "1" }, "2")).toThrow(
      StockInsuficienteError
    );
  });
});

describe("assertCambioDeTipoPermitido", () => {
  it("permite cambiar el tipo si no tiene movimientos", () => {
    expect(() =>
      assertCambioDeTipoPermitido({ tipo: "PRODUCTO", tieneMovimientos: false }, "SERVICIO")
    ).not.toThrow();
  });

  it("rechaza cambiar el tipo si ya tiene movimientos", () => {
    expect(() =>
      assertCambioDeTipoPermitido({ tipo: "PRODUCTO", tieneMovimientos: true }, "SERVICIO")
    ).toThrow(TipoItemBloqueadoError);
  });

  it("no lanza si no se pide cambiar el tipo, aunque tenga movimientos", () => {
    expect(() =>
      assertCambioDeTipoPermitido({ tipo: "PRODUCTO", tieneMovimientos: true }, undefined)
    ).not.toThrow();
  });

  it("no lanza si el nuevo tipo es igual al actual, aunque tenga movimientos", () => {
    expect(() =>
      assertCambioDeTipoPermitido({ tipo: "PRODUCTO", tieneMovimientos: true }, "PRODUCTO")
    ).not.toThrow();
  });
});

describe("assertItemEliminable", () => {
  it("permite eliminar un ítem sin movimientos", () => {
    expect(() => assertItemEliminable({ tieneMovimientos: false })).not.toThrow();
  });

  it("rechaza eliminar un ítem con movimientos", () => {
    expect(() => assertItemEliminable({ tieneMovimientos: true })).toThrow(ItemConMovimientosError);
  });
});

describe("calcularGananciaProducto", () => {
  it("calcula la ganancia y el margen sobre el precio de venta", () => {
    const result = calcularGananciaProducto("150000", "100000");
    expect(result.ganancia).toBe("50000");
    expect(result.margen).toBe("33.333333333333333333");
  });

  it("trata precio o costo vacíos como 0 sin lanzar", () => {
    expect(() => calcularGananciaProducto("", "")).not.toThrow();
    expect(calcularGananciaProducto("", "").ganancia).toBe("0");
  });

  it("no divide por cero cuando el precio es 0", () => {
    expect(calcularGananciaProducto("0", "0").margen).toBe("0");
  });
});

describe("calcularCostoPromedioPonderado", () => {
  it("pondera el costo nuevo por cantidad contra el stock/costo previos", () => {
    // 10 a 100.000 (stock/costo previos) + 10 a 95.000 (compra nueva) → 97.500
    expect(calcularCostoPromedioPonderado("10", "100000", "10", "95000")).toBe("97500");
  });

  it("usa el costo nuevo tal cual cuando no había stock previo", () => {
    expect(calcularCostoPromedioPonderado("0", null, "10", "95000")).toBe("95000");
  });

  it("trata costoPrevio null como 0 cuando sí había stock previo", () => {
    expect(calcularCostoPromedioPonderado("5", null, "5", "100000")).toBe("50000");
  });
});
