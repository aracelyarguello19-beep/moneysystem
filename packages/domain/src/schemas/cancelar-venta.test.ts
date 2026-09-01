import { describe, expect, it } from "vitest";
import { cancelarVentaSchema } from "./cancelar-venta";

const ventaItemId = "11111111-1111-1111-1111-111111111111";

describe("cancelarVentaSchema", () => {
  it("acepta itemsDevueltos ausente (cancelación total)", () => {
    const result = cancelarVentaSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("acepta itemsDevueltos con cantidades válidas", () => {
    const result = cancelarVentaSchema.safeParse({
      itemsDevueltos: [{ ventaItemId, cantidad: "3" }],
    });
    expect(result.success).toBe(true);
  });

  it("rechaza una cantidad a devolver cero o negativa", () => {
    const result = cancelarVentaSchema.safeParse({
      itemsDevueltos: [{ ventaItemId, cantidad: "0" }],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza un array vacío de itemsDevueltos", () => {
    const result = cancelarVentaSchema.safeParse({ itemsDevueltos: [] });
    expect(result.success).toBe(false);
  });
});
