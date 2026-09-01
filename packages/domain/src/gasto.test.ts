import { describe, expect, it } from "vitest";
import {
  assertTipoGastoFinanciero,
  assertTipoGastoLaboral,
  assertTipoGastoPersonal,
  obtenerClasificacionGasto,
  TipoGastoAmbitoInvalidoError,
  TipoGastoClasificacionInvalidaError,
} from "./gasto";

describe("assertTipoGastoLaboral", () => {
  it("no lanza para un TipoGasto LABORAL", () => {
    expect(() => assertTipoGastoLaboral({ ambito: "LABORAL" })).not.toThrow();
  });

  it("lanza para un TipoGasto PERSONAL", () => {
    expect(() => assertTipoGastoLaboral({ ambito: "PERSONAL" })).toThrow(
      TipoGastoAmbitoInvalidoError
    );
  });
});

describe("assertTipoGastoPersonal", () => {
  it("no lanza para un TipoGasto PERSONAL (Fijo, Variable o Financiero)", () => {
    expect(() => assertTipoGastoPersonal({ ambito: "PERSONAL" })).not.toThrow();
  });

  it("lanza para un TipoGasto LABORAL", () => {
    expect(() => assertTipoGastoPersonal({ ambito: "LABORAL" })).toThrow(
      TipoGastoAmbitoInvalidoError
    );
  });
});

describe("assertTipoGastoFinanciero", () => {
  it("no lanza para clasificación FINANCIERO", () => {
    expect(() => assertTipoGastoFinanciero({ clasificacion: "FINANCIERO" })).not.toThrow();
  });

  it("lanza para clasificación OPERATIVO", () => {
    expect(() => assertTipoGastoFinanciero({ clasificacion: "OPERATIVO" })).toThrow(
      TipoGastoClasificacionInvalidaError
    );
  });
});

describe("obtenerClasificacionGasto", () => {
  it("hereda la clasificación OPERATIVO sin pedirla de nuevo", () => {
    expect(obtenerClasificacionGasto({ clasificacion: "OPERATIVO" })).toBe("OPERATIVO");
  });

  it("hereda la clasificación FINANCIERO sin pedirla de nuevo", () => {
    expect(obtenerClasificacionGasto({ clasificacion: "FINANCIERO" })).toBe("FINANCIERO");
  });

  // AC1/AC2 (Story 6.3): un gasto personal FIJO vs VARIABLE clasifica
  // correctamente, sin pedir la clasificación de nuevo en el formulario —
  // misma función que ya cubre el caso Laboral (OPERATIVO/FINANCIERO).
  it("hereda la clasificación FIJO sin pedirla de nuevo", () => {
    expect(obtenerClasificacionGasto({ clasificacion: "FIJO" })).toBe("FIJO");
  });

  it("hereda la clasificación VARIABLE sin pedirla de nuevo", () => {
    expect(obtenerClasificacionGasto({ clasificacion: "VARIABLE" })).toBe("VARIABLE");
  });
});
