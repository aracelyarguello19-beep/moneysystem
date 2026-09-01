import { describe, expect, it } from "vitest";
import { calcularBalancePersonal } from "./balance-personal";

describe("calcularBalancePersonal", () => {
  it("aplica la fórmula exacta del AC2 con retiros de múltiples negocios", () => {
    const resultado = calcularBalancePersonal({
      retiros: [
        { negocioId: "negocio-a", monto: "1000000" },
        { negocioId: "negocio-b", monto: "500000" },
        { negocioId: "negocio-a", monto: "200000" },
      ],
      gastosFijos: ["300000", "100000"],
      gastosVariables: ["150000"],
      aporteReserva: "200000",
      deudaTarjetaPersonal: "0",
    });

    // totalRetiros = 1.700.000; gastosFijos = 400.000; gastosVariables = 150.000
    expect(resultado.totalRetiros).toBe("1700000");
    expect(resultado.gastosFijos).toBe("400000");
    expect(resultado.gastosVariables).toBe("150000");
    expect(resultado.aporteReserva).toBe("200000");
    // disponible = 1.700.000 - 400.000 - 150.000 - 200.000 = 950.000
    expect(resultado.disponible).toBe("950000");
  });

  it("desglosa los retiros por negocio de origen (AC3)", () => {
    const resultado = calcularBalancePersonal({
      retiros: [
        { negocioId: "negocio-a", monto: "1000000" },
        { negocioId: "negocio-b", monto: "500000" },
        { negocioId: "negocio-a", monto: "200000" },
      ],
      gastosFijos: [],
      gastosVariables: [],
      aporteReserva: "0",
      deudaTarjetaPersonal: "0",
    });

    expect(resultado.retirosPorNegocio).toHaveLength(2);
    expect(resultado.retirosPorNegocio).toContainEqual({ negocioId: "negocio-a", total: "1200000" });
    expect(resultado.retirosPorNegocio).toContainEqual({ negocioId: "negocio-b", total: "500000" });
  });

  it("nunca resta la deuda de tarjeta personal del disponible (AC4)", () => {
    const base = {
      retiros: [{ negocioId: "negocio-a", monto: "1000000" }],
      gastosFijos: ["100000"],
      gastosVariables: ["50000"],
      aporteReserva: "100000",
    };

    const sinDeuda = calcularBalancePersonal({ ...base, deudaTarjetaPersonal: "0" });
    const conDeudaGrande = calcularBalancePersonal({ ...base, deudaTarjetaPersonal: "5000000" });

    // El disponible es idéntico sin importar la deuda de tarjeta — se
    // retorna aparte, nunca se resta (AC4).
    expect(sinDeuda.disponible).toBe(conDeudaGrande.disponible);
    expect(conDeudaGrande.deudaTarjetaPersonal).toBe("5000000");
  });

  it("retorna todo en cero cuando no hay retiros, gastos ni aporte", () => {
    const resultado = calcularBalancePersonal({
      retiros: [],
      gastosFijos: [],
      gastosVariables: [],
      aporteReserva: "0",
      deudaTarjetaPersonal: "0",
    });

    expect(resultado.totalRetiros).toBe("0");
    expect(resultado.disponible).toBe("0");
    expect(resultado.retirosPorNegocio).toEqual([]);
  });
});
