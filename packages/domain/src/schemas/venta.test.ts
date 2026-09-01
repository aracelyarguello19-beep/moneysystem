import { describe, expect, it } from "vitest";
import { registrarVentaSchema } from "./venta";

const itemId = "11111111-1111-1111-1111-111111111111";
const monedaId = "22222222-2222-2222-2222-222222222222";
const cuentaFinancieraId = "33333333-3333-3333-3333-333333333333";

const baseItem = { itemId, cantidad: "1", precioUnitario: "100.00" };

describe("registrarVentaSchema", () => {
  it("rechaza CREDITO_CLIENTE sin cliente", () => {
    const result = registrarVentaSchema.safeParse({
      formaCobro: "CREDITO_CLIENTE",
      impuesto: "0",
      monedaId,
      tasaCambioId: null,
      cuentaFinancieraId: null,
      items: [baseItem],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza CREDITO_CLIENTE con cuentaFinancieraId presente", () => {
    const result = registrarVentaSchema.safeParse({
      cliente: "Juan Pérez",
      formaCobro: "CREDITO_CLIENTE",
      impuesto: "0",
      monedaId,
      tasaCambioId: null,
      cuentaFinancieraId,
      items: [baseItem],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza una venta sin ítems", () => {
    const result = registrarVentaSchema.safeParse({
      formaCobro: "EFECTIVO",
      impuesto: "0",
      monedaId,
      tasaCambioId: null,
      cuentaFinancieraId,
      items: [],
    });
    expect(result.success).toBe(false);
  });

  it("acepta CREDITO_CLIENTE con cliente y sin cuentaFinancieraId", () => {
    const result = registrarVentaSchema.safeParse({
      cliente: "Juan Pérez",
      formaCobro: "CREDITO_CLIENTE",
      impuesto: "0",
      monedaId,
      tasaCambioId: null,
      cuentaFinancieraId: null,
      items: [baseItem],
    });
    expect(result.success).toBe(true);
  });

  it("acepta EFECTIVO con cuentaFinancieraId y sin cliente", () => {
    const result = registrarVentaSchema.safeParse({
      formaCobro: "EFECTIVO",
      impuesto: "0",
      monedaId,
      tasaCambioId: null,
      cuentaFinancieraId,
      items: [baseItem],
    });
    expect(result.success).toBe(true);
  });
});
