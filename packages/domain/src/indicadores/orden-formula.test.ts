import { describe, expect, it } from "vitest";
import { calcularIndicadores } from "./indicadores";

// AC2: verifica el orden estricto de la fórmula — cada indicador se deriva
// exactamente del anterior, no de un recálculo independiente.
// Ingresos Brutos → Ingresos Netos → Ganancia Bruta → Resultado Operativo → Ganancia Líquida.
describe("calcularIndicadores — orden estricto de la fórmula (AC2)", () => {
  it("cada paso de la cadena se deriva exactamente del anterior", () => {
    const indicadores = calcularIndicadores({
      ventas: [
        {
          estado: "ACTIVA",
          impuesto: "15",
          items: [
            {
              itemTipo: "PRODUCTO",
              cantidad: "10",
              cantidadDevuelta: "0",
              precioUnitario: "20",
              costoServicio: null,
              costoCompra: "5",
            },
          ],
        },
      ],
      gastos: [
        { monto: "30", clasificacion: "OPERATIVO" },
        { monto: "10", clasificacion: "FINANCIERO" },
      ],
    });

    const ingresosBrutos = Number(indicadores.ingresosBrutos);
    const ingresosNetos = Number(indicadores.ingresosNetos);
    const cmv = Number(indicadores.cmv);
    const csv = Number(indicadores.csv);
    const gananciaBruta = Number(indicadores.gananciaBruta);
    const gastosOperativos = Number(indicadores.gastosOperativos);
    const resultadoOperativo = Number(indicadores.resultadoOperativo);
    const gastosFinancieros = Number(indicadores.gastosFinancieros);
    const gananciaLiquida = Number(indicadores.gananciaLiquida);

    expect(ingresosBrutos).toBe(200); // 10 × 20
    expect(ingresosNetos).toBe(ingresosBrutos - 15 - 0); // − impuesto − devoluciones
    expect(cmv).toBe(50); // 10 × 5
    expect(csv).toBe(0);
    expect(gananciaBruta).toBe(ingresosNetos - cmv - csv);
    expect(resultadoOperativo).toBe(gananciaBruta - gastosOperativos);
    expect(gananciaLiquida).toBe(resultadoOperativo - gastosFinancieros);
    expect(Number(indicadores.margenGanancia)).toBeCloseTo(gananciaLiquida / ingresosNetos, 10);
  });

  it("margenGanancia es '0' cuando ingresosNetos es 0, sin dividir por cero", () => {
    const indicadores = calcularIndicadores({ ventas: [], gastos: [] });
    expect(indicadores.ingresosNetos).toBe("0");
    expect(indicadores.margenGanancia).toBe("0");
  });
});
