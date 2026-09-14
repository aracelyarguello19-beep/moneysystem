import { describe, expect, it } from "vitest";
import { assertMismaMoneda, assertMonedaEsBase, assertMonedaNoEsBase, MonedaInvalidaError } from "./moneda";

describe("assertMonedaEsBase", () => {
  it("no lanza para la moneda oficial", () => {
    expect(() => assertMonedaEsBase({ esBase: true, codigo: "PYG" })).not.toThrow();
  });

  it("lanza para una moneda extranjera", () => {
    expect(() => assertMonedaEsBase({ esBase: false, codigo: "BRL" })).toThrow(MonedaInvalidaError);
  });
});

describe("assertMonedaNoEsBase", () => {
  it("no lanza para una moneda extranjera", () => {
    expect(() => assertMonedaNoEsBase({ esBase: false, codigo: "USD" })).not.toThrow();
  });

  it("lanza para la moneda oficial", () => {
    expect(() => assertMonedaNoEsBase({ esBase: true, codigo: "PYG" })).toThrow(MonedaInvalidaError);
  });
});

describe("assertMismaMoneda", () => {
  it("no lanza cuando comparten id", () => {
    expect(() => assertMismaMoneda({ id: "moneda-1" }, { id: "moneda-1" })).not.toThrow();
  });

  it("lanza cuando son monedas distintas", () => {
    expect(() => assertMismaMoneda({ id: "moneda-1" }, { id: "moneda-2" })).toThrow(MonedaInvalidaError);
  });
});
