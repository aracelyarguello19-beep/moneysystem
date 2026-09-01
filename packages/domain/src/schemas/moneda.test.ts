import { describe, expect, it } from "vitest";
import { crearMonedaSchema } from "./moneda";

const base = { codigo: "USD", nombre: "Dólar" };

describe("crearMonedaSchema", () => {
  it("rechaza negocioId presente cuando ambito === 'PERSONAL'", () => {
    const result = crearMonedaSchema.safeParse({
      ...base,
      ambito: "PERSONAL",
      negocioId: "11111111-1111-1111-1111-111111111111",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza negocioId ausente (null) cuando ambito === 'LABORAL'", () => {
    const result = crearMonedaSchema.safeParse({
      ...base,
      ambito: "LABORAL",
      negocioId: null,
    });
    expect(result.success).toBe(false);
  });

  it("acepta PERSONAL con negocioId null", () => {
    const result = crearMonedaSchema.safeParse({ ...base, ambito: "PERSONAL", negocioId: null });
    expect(result.success).toBe(true);
  });

  it("acepta LABORAL con negocioId presente", () => {
    const result = crearMonedaSchema.safeParse({
      ...base,
      ambito: "LABORAL",
      negocioId: "11111111-1111-1111-1111-111111111111",
    });
    expect(result.success).toBe(true);
  });
});
