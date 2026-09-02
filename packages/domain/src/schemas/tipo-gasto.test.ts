import { describe, expect, it } from "vitest";
import { crearTipoGastoSchema } from "./tipo-gasto";

const negocioId = "11111111-1111-1111-1111-111111111111";

describe("crearTipoGastoSchema", () => {
  it("rechaza un tipo de gasto sin clasificación", () => {
    const result = crearTipoGastoSchema.safeParse({
      negocioId,
      nombre: "Alquiler",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza una clasificación fuera del catálogo Laboral", () => {
    const result = crearTipoGastoSchema.safeParse({
      negocioId,
      nombre: "Alquiler",
      clasificacion: "FIJO",
    });
    expect(result.success).toBe(false);
  });

  it("acepta clasificación OPERATIVO con negocioId", () => {
    const result = crearTipoGastoSchema.safeParse({
      negocioId,
      nombre: "Alquiler",
      clasificacion: "OPERATIVO",
    });
    expect(result.success).toBe(true);
  });

  it("acepta clasificación FINANCIERO con negocioId", () => {
    const result = crearTipoGastoSchema.safeParse({
      negocioId,
      nombre: "Interés tarjeta",
      clasificacion: "FINANCIERO",
    });
    expect(result.success).toBe(true);
  });
});
