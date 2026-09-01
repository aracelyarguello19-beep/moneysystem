import { describe, expect, it } from "vitest";
import { crearNegocioSchema } from "./negocio";

describe("crearNegocioSchema", () => {
  it("rechaza nombre vacío", () => {
    const result = crearNegocioSchema.safeParse({ nombre: "" });
    expect(result.success).toBe(false);
  });

  it("rechaza nombre compuesto solo de espacios", () => {
    const result = crearNegocioSchema.safeParse({ nombre: "   " });
    expect(result.success).toBe(false);
  });

  it("acepta un nombre válido", () => {
    const result = crearNegocioSchema.safeParse({ nombre: "Mi negocio" });
    expect(result.success).toBe(true);
  });
});
