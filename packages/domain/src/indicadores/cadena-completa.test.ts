import { describe, expect, it } from "vitest";
import { calcularIndicadores, type VentaIndicador } from "./indicadores";

// [Source: architecture/testing-strategy.md#Test Examples — Story 5.1 Task 4]
const ventaConProductoYServicio: VentaIndicador = {
  estado: "ACTIVA",
  impuesto: "0",
  items: [
    {
      itemTipo: "PRODUCTO",
      cantidad: "2",
      cantidadDevuelta: "0",
      precioUnitario: "100",
      costoServicio: null,
      costoCompra: "40",
    },
    {
      itemTipo: "SERVICIO",
      cantidad: null,
      cantidadDevuelta: "0",
      precioUnitario: "100",
      costoServicio: "50",
      costoCompra: null,
    },
  ],
};

const ventaCanceladaParcial: VentaIndicador = {
  estado: "DEVUELTA_PARCIAL",
  impuesto: "0",
  items: [
    {
      itemTipo: "PRODUCTO",
      cantidad: "4",
      cantidadDevuelta: "1",
      precioUnitario: "50",
      costoServicio: null,
      costoCompra: "20",
    },
  ],
};

const gastoOperativo = { monto: "60", clasificacion: "OPERATIVO" as const };
const gastoFinanciero = { monto: "20", clasificacion: "FINANCIERO" as const };

describe("calcularIndicadores — cadena completa", () => {
  it("calcula Ganancia Líquida correctamente con venta cancelada parcialmente y gastos mixtos", () => {
    const indicadores = calcularIndicadores({
      ventas: [ventaConProductoYServicio, ventaCanceladaParcial],
      gastos: [gastoOperativo, gastoFinanciero],
    });

    // Ingresos Brutos: (2×100 + 1×100) + 4×50 = 300 + 200 = 500
    expect(indicadores.ingresosBrutos).toBe("500");
    // Efecto devoluciones: 1×50 = 50 → Ingresos Netos = 500 − 0 − 50 = 450
    expect(indicadores.ingresosNetos).toBe("450");
    // CMV: 2×40 (sin devolución) + 3×20 (4−1 neto) = 80 + 60 = 140
    expect(indicadores.cmv).toBe("140");
    // CSV: 1×50 (servicio sin devolución)
    expect(indicadores.csv).toBe("50");
    // Ganancia Bruta = 450 − 140 − 50 = 260
    expect(indicadores.gananciaBruta).toBe("260");
    expect(indicadores.gastosOperativos).toBe("60");
    // Resultado Operativo = 260 − 60 = 200
    expect(indicadores.resultadoOperativo).toBe("200");
    expect(indicadores.gastosFinancieros).toBe("20");
    // Ganancia Líquida = 200 − 20 = 180
    expect(indicadores.gananciaLiquida).toBe("180");
    // Margen = 180 / 450 = 0.4
    expect(indicadores.margenGanancia).toBe("0.4");
  });

  it("excluye por completo una venta CANCELADA (no solo su porción devuelta)", () => {
    const ventaTotalmenteCancelada: VentaIndicador = {
      ...ventaConProductoYServicio,
      estado: "CANCELADA",
    };

    const indicadores = calcularIndicadores({
      ventas: [ventaTotalmenteCancelada],
      gastos: [],
    });

    expect(indicadores.ingresosBrutos).toBe("0");
    expect(indicadores.ingresosNetos).toBe("0");
    expect(indicadores.cmv).toBe("0");
    expect(indicadores.csv).toBe("0");
  });
});
