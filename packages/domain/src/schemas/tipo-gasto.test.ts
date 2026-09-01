import { describe, expect, it } from "vitest";
import { crearTipoGastoSchema } from "./tipo-gasto";

const negocioId = "11111111-1111-1111-1111-111111111111";

describe("crearTipoGastoSchema", () => {
  it("rechaza un tipo de gasto sin clasificación (LABORAL)", () => {
    const result = crearTipoGastoSchema.safeParse({
      ambito: "LABORAL",
      negocioId,
      nombre: "Alquiler",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza un tipo de gasto sin clasificación (PERSONAL)", () => {
    const result = crearTipoGastoSchema.safeParse({
      ambito: "PERSONAL",
      negocioId: null,
      nombre: "Supermercado",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza clasificación de Personal (FIJO) en ámbito LABORAL", () => {
    const result = crearTipoGastoSchema.safeParse({
      ambito: "LABORAL",
      negocioId,
      nombre: "Alquiler",
      clasificacion: "FIJO",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza clasificación de Laboral (OPERATIVO) en ámbito PERSONAL", () => {
    const result = crearTipoGastoSchema.safeParse({
      ambito: "PERSONAL",
      negocioId: null,
      nombre: "Supermercado",
      clasificacion: "OPERATIVO",
    });
    expect(result.success).toBe(false);
  });

  it("acepta LABORAL con clasificación OPERATIVO y negocioId", () => {
    const result = crearTipoGastoSchema.safeParse({
      ambito: "LABORAL",
      negocioId,
      nombre: "Alquiler",
      clasificacion: "OPERATIVO",
    });
    expect(result.success).toBe(true);
  });

  it("acepta PERSONAL con clasificación FINANCIERO y negocioId null", () => {
    const result = crearTipoGastoSchema.safeParse({
      ambito: "PERSONAL",
      negocioId: null,
      nombre: "Interés tarjeta",
      clasificacion: "FINANCIERO",
    });
    expect(result.success).toBe(true);
  });
});
