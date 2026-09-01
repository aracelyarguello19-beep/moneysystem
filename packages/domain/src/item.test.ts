import { describe, expect, it } from "vitest";
import { assertCambioDeTipoPermitido, TipoItemBloqueadoError } from "./item";

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
