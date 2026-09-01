import { describe, expect, it } from "vitest";
import { calcularIndicadores, type VentaIndicador } from "./indicadores";

// Story 5.2, AC2/Task 4: el desglose producto/servicio no debe duplicar ni
// omitir nada respecto a los totales globales de Story 5.1.
describe("calcularIndicadores — desglose producto/servicio", () => {
  it("gananciaBruta de producto + servicio suma exacto a la gananciaBruta global (con impuesto prorrateado)", () => {
    const venta: VentaIndicador = {
      estado: "ACTIVA",
      impuesto: "20",
      items: [
        {
          itemTipo: "PRODUCTO",
          cantidad: "3",
          cantidadDevuelta: "0",
          precioUnitario: "100",
          costoServicio: null,
          costoCompra: "30",
        },
        {
          itemTipo: "SERVICIO",
          cantidad: null,
          cantidadDevuelta: "0",
          precioUnitario: "100",
          costoServicio: "40",
          costoCompra: null,
        },
      ],
    };

    const indicadores = calcularIndicadores({ ventas: [venta], gastos: [] });

    // Bruto: 3×100 + 1×100 = 400; impuesto 20 prorrateado 300/400 y 100/400 → 15 y 5
    expect(indicadores.desglose.producto.cmv).toBe("90"); // 3×30
    expect(indicadores.desglose.producto.gananciaBruta).toBe("195"); // 300−15−90
    expect(indicadores.desglose.servicio.csv).toBe("40");
    expect(indicadores.desglose.servicio.gananciaBruta).toBe("55"); // 100−5−40

    const sumaDesglose = Number(indicadores.desglose.producto.gananciaBruta) +
      Number(indicadores.desglose.servicio.gananciaBruta);
    expect(sumaDesglose).toBe(Number(indicadores.gananciaBruta));
    expect(indicadores.gananciaBruta).toBe("250");
  });

  it("no omite ítems: una venta solo-servicio no deja cmv/gananciaBruta de producto en algo distinto de 0", () => {
    const venta: VentaIndicador = {
      estado: "ACTIVA",
      impuesto: "0",
      items: [
        {
          itemTipo: "SERVICIO",
          cantidad: null,
          cantidadDevuelta: "0",
          precioUnitario: "80",
          costoServicio: "20",
          costoCompra: null,
        },
      ],
    };

    const indicadores = calcularIndicadores({ ventas: [venta], gastos: [] });

    expect(indicadores.desglose.producto.cmv).toBe("0");
    expect(indicadores.desglose.producto.gananciaBruta).toBe("0");
    expect(indicadores.desglose.servicio.gananciaBruta).toBe(indicadores.gananciaBruta);
  });
});
