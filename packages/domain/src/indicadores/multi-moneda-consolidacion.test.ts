import { describe, expect, it } from "vitest";
import { consolidarIndicadoresPorNegocio } from "./consolidado";
import type { IndicadoresFinancieros } from "./indicadores";

function indicadores(gananciaLiquida: string, ingresosNetos: string): IndicadoresFinancieros {
  return {
    ingresosBrutos: ingresosNetos,
    ingresosNetos,
    cmv: "0",
    csv: "0",
    gananciaBruta: gananciaLiquida,
    gastosOperativos: "0",
    resultadoOperativo: gananciaLiquida,
    gastosFinancieros: "0",
    gananciaLiquida,
    margenGanancia: "0",
    desglose: { producto: { cmv: "0", gananciaBruta: "0" }, servicio: { csv: "0", gananciaBruta: "0" } },
  };
}

// AC4 (Story 5.4): el consolidado de dos negocios en monedas distintas se
// calcula convirtiendo primero cada negocio a Guaraníes, sin sumar montos
// de monedas distintas directamente.
describe("consolidarIndicadoresPorNegocio — multi-moneda", () => {
  it("convierte cada negocio a Guaraníes antes de sumar (no suma USD + PYG directamente)", () => {
    const negocioEnGuaranies = {
      negocioId: "negocio-pyg",
      nombre: "Negocio PYG",
      indicadores: indicadores("500000", "1000000"),
      esMonedaBase: true,
      tasa: null,
    };
    const negocioEnDolares = {
      negocioId: "negocio-usd",
      nombre: "Negocio USD",
      indicadores: indicadores("100", "200"), // en USD
      esMonedaBase: false,
      tasa: "7300", // 1 USD = 7300 PYG
    };

    const resultado = consolidarIndicadoresPorNegocio([negocioEnGuaranies, negocioEnDolares]);

    // Negocio USD convertido: gananciaLiquida 100×7300 = 730000, ingresosNetos 200×7300 = 1460000
    expect(resultado.porNegocio[1].indicadoresEnGuaranies.gananciaLiquida).toBe("730000");
    expect(resultado.porNegocio[1].indicadoresEnGuaranies.ingresosNetos).toBe("1460000");

    // Consolidado: 500000 + 730000 = 1230000 (nunca 500000 + 100)
    expect(resultado.indicadoresConsolidados.gananciaLiquida).toBe("1230000");
    expect(resultado.indicadoresConsolidados.ingresosNetos).toBe("2460000");
  });

  it("recalcula el margen sobre los totales consolidados, no promedia los márgenes individuales", () => {
    // Negocio A: margen 50% (gananciaLiquida 50 / ingresosNetos 100)
    // Negocio B: margen 10% (gananciaLiquida 10 / ingresosNetos 100)
    // Promedio simple de márgenes sería 30% — el correcto, sobre totales, es 60/200 = 30% también acá
    // por diseño (mismos ingresosNetos); se agrega un tercer negocio con escala distinta para diferenciarlos.
    const a = { negocioId: "a", nombre: "A", indicadores: indicadores("50", "100"), esMonedaBase: true, tasa: null };
    const b = { negocioId: "b", nombre: "B", indicadores: indicadores("10", "100"), esMonedaBase: true, tasa: null };
    const c = {
      negocioId: "c",
      nombre: "C",
      indicadores: indicadores("900", "1000"), // margen 90%, pero con mucho más volumen
      esMonedaBase: true,
      tasa: null,
    };

    const resultado = consolidarIndicadoresPorNegocio([a, b, c]);

    const promedioSimpleDeMargenes = (0.5 + 0.1 + 0.9) / 3; // 0.5 — NO es lo que se espera
    const margenSobreTotales = (50 + 10 + 900) / (100 + 100 + 1000); // 960/1200 = 0.8

    expect(Number(resultado.indicadoresConsolidados.margenGanancia)).toBeCloseTo(margenSobreTotales, 10);
    expect(Number(resultado.indicadoresConsolidados.margenGanancia)).not.toBeCloseTo(
      promedioSimpleDeMargenes,
      2
    );
  });

  it("devuelve totales en '0' para una lista vacía de negocios", () => {
    const resultado = consolidarIndicadoresPorNegocio([]);
    expect(resultado.indicadoresConsolidados.gananciaLiquida).toBe("0");
    expect(resultado.indicadoresConsolidados.margenGanancia).toBe("0");
    expect(resultado.porNegocio).toHaveLength(0);
  });
});
