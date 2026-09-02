import { describe, expect, it } from "vitest";
import { crearMonedaSchema } from "./moneda";

const base = { codigo: "USD", nombre: "Dólar" };

describe("crearMonedaSchema", () => {
  it("rechaza negocioId ausente", () => {
    const result = crearMonedaSchema.safeParse({ ...base, negocioId: null });
    expect(result.success).toBe(false);
  });

  it("acepta negocioId presente", () => {
    const result = crearMonedaSchema.safeParse({
      ...base,
      negocioId: "11111111-1111-1111-1111-111111111111",
    });
    expect(result.success).toBe(true);
  });
});
