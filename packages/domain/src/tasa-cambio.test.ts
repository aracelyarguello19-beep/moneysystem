import { describe, expect, it } from "vitest";
import { convertirAGuaranies } from "./tasa-cambio";

describe("convertirAGuaranies", () => {
  it("no altera el monto cuando la moneda ya es la base", () => {
    const resultado = convertirAGuaranies({ monto: "100.50", esMonedaBase: true, tasa: null });
    expect(resultado).toBe("100.50");
  });

  it("aplica la tasa cuando la moneda no es la base", () => {
    const resultado = convertirAGuaranies({ monto: "10", esMonedaBase: false, tasa: "7300" });
    expect(resultado).toBe("73000");
  });

  it("devuelve '0' si no es moneda base y no hay tasa cargada", () => {
    const resultado = convertirAGuaranies({ monto: "10", esMonedaBase: false, tasa: null });
    expect(resultado).toBe("0");
  });
});
