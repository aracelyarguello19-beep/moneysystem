import { describe, expect, it } from "vitest";
import { registrarCompraSchema } from "./compra";

const itemId = "11111111-1111-1111-1111-111111111111";
const otroItemId = "44444444-4444-4444-4444-444444444444";
const monedaId = "22222222-2222-2222-2222-222222222222";
const cuentaFinancieraId = "33333333-3333-3333-3333-333333333333";

const base = {
  items: [{ itemId, costoUnitario: "10.00", cantidad: "5", monedaId }],
  fecha: "2026-09-01",
};

describe("registrarCompraSchema", () => {
  it("rechaza cuentaFinancieraId presente cuando formaPago es CREDITO_PROVEEDOR", () => {
    const result = registrarCompraSchema.safeParse({
      ...base,
      formaPago: "CREDITO_PROVEEDOR",
      cuentaFinancieraId,
    });
    expect(result.success).toBe(false);
  });

  it("rechaza cuentaFinancieraId ausente cuando formaPago no es CREDITO_PROVEEDOR", () => {
    const result = registrarCompraSchema.safeParse({
      ...base,
      formaPago: "EFECTIVO",
      cuentaFinancieraId: null,
    });
    expect(result.success).toBe(false);
  });

  it("rechaza cantidad cero o negativa en una línea", () => {
    const result = registrarCompraSchema.safeParse({
      ...base,
      items: [{ itemId, costoUnitario: "10.00", cantidad: "0", monedaId }],
      formaPago: "EFECTIVO",
      cuentaFinancieraId,
    });
    expect(result.success).toBe(false);
  });

  it("rechaza items vacío", () => {
    const result = registrarCompraSchema.safeParse({
      ...base,
      items: [],
      formaPago: "EFECTIVO",
      cuentaFinancieraId,
    });
    expect(result.success).toBe(false);
  });

  it("acepta CREDITO_PROVEEDOR sin cuentaFinancieraId", () => {
    const result = registrarCompraSchema.safeParse({
      ...base,
      formaPago: "CREDITO_PROVEEDOR",
      cuentaFinancieraId: null,
    });
    expect(result.success).toBe(true);
  });

  it("acepta EFECTIVO con cuentaFinancieraId", () => {
    const result = registrarCompraSchema.safeParse({
      ...base,
      formaPago: "EFECTIVO",
      cuentaFinancieraId,
    });
    expect(result.success).toBe(true);
  });

  it("acepta varios productos en una sola compra, cada uno con su propia moneda y cotización", () => {
    const result = registrarCompraSchema.safeParse({
      ...base,
      items: [
        { itemId, costoUnitario: "10.00", cantidad: "5", monedaId },
        { itemId: otroItemId, costoUnitario: "20.00", cantidad: "2", monedaId: cuentaFinancieraId, cotizacion: "7300" },
      ],
      formaPago: "EFECTIVO",
      cuentaFinancieraId,
    });
    expect(result.success).toBe(true);
  });
});
