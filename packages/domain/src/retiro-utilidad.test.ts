import { describe, expect, it } from "vitest";
import { sumarRetiros } from "./retiro-utilidad";

describe("sumarRetiros", () => {
  it("suma únicamente los retiros efectivamente registrados", () => {
    const total = sumarRetiros([{ monto: "100000" }, { monto: "50000.5" }]);
    expect(total).toBe("150000.5");
  });

  it("nunca deriva un total a partir de la ganancia líquida — solo suma lo registrado", () => {
    // AC3: aunque la ganancia líquida del negocio fuera mucho mayor, la suma
    // de retiros solo refleja lo que el usuario efectivamente retiró.
    const gananciaLiquidaHipotetica = "10000000";
    const retirosRegistrados = [{ monto: "200000" }];

    const total = sumarRetiros(retirosRegistrados);

    expect(total).toBe("200000");
    expect(total).not.toBe(gananciaLiquidaHipotetica);
  });

  it("retorna cero para una lista vacía de retiros", () => {
    expect(sumarRetiros([])).toBe("0");
  });
});
