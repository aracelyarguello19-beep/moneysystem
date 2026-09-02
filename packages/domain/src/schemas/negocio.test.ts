import { describe, expect, it } from "vitest";
import { crearNegocioSchema } from "./negocio";

describe("crearNegocioSchema", () => {
  it("rechaza nombre vacío", () => {
    const result = crearNegocioSchema.safeParse({ nombre: "", tipo: "MIXTO" });
    expect(result.success).toBe(false);
  });

  it("rechaza nombre compuesto solo de espacios", () => {
    const result = crearNegocioSchema.safeParse({ nombre: "   ", tipo: "MIXTO" });
    expect(result.success).toBe(false);
  });

  it("rechaza sin tipo de negocio", () => {
    const result = crearNegocioSchema.safeParse({ nombre: "Mi negocio" });
    expect(result.success).toBe(false);
  });

  it("acepta un nombre y tipo válidos", () => {
    const result = crearNegocioSchema.safeParse({ nombre: "Mi negocio", tipo: "PRODUCTOS" });
    expect(result.success).toBe(true);
  });
});
