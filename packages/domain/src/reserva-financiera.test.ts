import { describe, expect, it } from "vitest";
import { debeAplicarAporteReserva } from "./reserva-financiera";

describe("debeAplicarAporteReserva", () => {
  it("no aplica cuando el aporte está pausado (aportePorPeriodo = 0)", () => {
    expect(
      debeAplicarAporteReserva({ aportePorPeriodo: "0", ultimoPeriodoAplicado: null }, "2026-09")
    ).toBe(false);
  });

  it("no vuelve a aplicar el aporte ya procesado en el mismo período", () => {
    expect(
      debeAplicarAporteReserva(
        { aportePorPeriodo: "100000", ultimoPeriodoAplicado: "2026-09" },
        "2026-09"
      )
    ).toBe(false);
  });

  it("aplica un aporte activo cuyo último período aplicado es distinto del actual", () => {
    expect(
      debeAplicarAporteReserva(
        { aportePorPeriodo: "100000", ultimoPeriodoAplicado: "2026-08" },
        "2026-09"
      )
    ).toBe(true);
    expect(
      debeAplicarAporteReserva({ aportePorPeriodo: "100000", ultimoPeriodoAplicado: null }, "2026-09")
    ).toBe(true);
  });
});
