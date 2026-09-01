import { describe, expect, it } from "vitest";
import {
  calcularMontoRetiroPorRegla,
  debeAplicarRegla,
  esUltimoDiaDelMes,
  periodoMensualDe,
  rangoDelPeriodoMensual,
} from "./regla-retiro";

describe("calcularMontoRetiroPorRegla", () => {
  it("PORCENTAJE calcula sobre la Ganancia Líquida del período", () => {
    const monto = calcularMontoRetiroPorRegla({ tipo: "PORCENTAJE", valor: "20" }, "1000000");
    expect(monto).toBe("200000");
  });

  it("MONTO_FIJO usa el valor directamente, sin relación con la ganancia del período", () => {
    const monto = calcularMontoRetiroPorRegla({ tipo: "MONTO_FIJO", valor: "500000" }, "1000000");
    expect(monto).toBe("500000");

    const montoConGananciaMenor = calcularMontoRetiroPorRegla(
      { tipo: "MONTO_FIJO", valor: "500000" },
      "10"
    );
    expect(montoConGananciaMenor).toBe("500000");
  });
});

describe("debeAplicarRegla", () => {
  it("no aplica una regla desactivada aunque el período no se haya procesado", () => {
    expect(debeAplicarRegla({ activa: false, ultimoPeriodoAplicado: null }, "2026-09")).toBe(false);
  });

  it("no vuelve a aplicar una regla ya procesada en el mismo período (idempotencia del cron)", () => {
    expect(debeAplicarRegla({ activa: true, ultimoPeriodoAplicado: "2026-09" }, "2026-09")).toBe(
      false
    );
  });

  it("aplica una regla activa cuyo último período aplicado es distinto del actual", () => {
    expect(debeAplicarRegla({ activa: true, ultimoPeriodoAplicado: "2026-08" }, "2026-09")).toBe(
      true
    );
    expect(debeAplicarRegla({ activa: true, ultimoPeriodoAplicado: null }, "2026-09")).toBe(true);
  });
});

describe("periodoMensualDe", () => {
  it("formatea la fecha como 'YYYY-MM' en UTC", () => {
    expect(periodoMensualDe(new Date("2026-09-01T06:00:00Z"))).toBe("2026-09");
    expect(periodoMensualDe(new Date("2026-01-05T00:00:00Z"))).toBe("2026-01");
  });
});

describe("esUltimoDiaDelMes", () => {
  it("es true el 30 de septiembre (mes de 30 días)", () => {
    expect(esUltimoDiaDelMes(new Date("2026-09-30T06:00:00Z"))).toBe(true);
  });

  it("es false el 29 de septiembre", () => {
    expect(esUltimoDiaDelMes(new Date("2026-09-29T06:00:00Z"))).toBe(false);
  });

  it("es true el 28 de febrero en un año no bisiesto", () => {
    expect(esUltimoDiaDelMes(new Date("2026-02-28T06:00:00Z"))).toBe(true);
  });

  it("es true el 29 de febrero en un año bisiesto", () => {
    expect(esUltimoDiaDelMes(new Date("2028-02-29T06:00:00Z"))).toBe(true);
    expect(esUltimoDiaDelMes(new Date("2028-02-28T06:00:00Z"))).toBe(false);
  });
});

describe("rangoDelPeriodoMensual", () => {
  it("devuelve el primer y último día calendario del mes de la fecha", () => {
    const { desde, hasta } = rangoDelPeriodoMensual(new Date("2026-09-15T12:00:00Z"));
    expect(desde.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(hasta.toISOString().slice(0, 10)).toBe("2026-09-30");
  });
});
