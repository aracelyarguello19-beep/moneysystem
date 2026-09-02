import { describe, expect, it } from "vitest";
import { assertCambioDeTipoPermitido, calcularGananciaProducto, TipoItemBloqueadoError } from "./item";

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
