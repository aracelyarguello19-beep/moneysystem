import { describe, expect, it } from "vitest";
import { crearItemSchema, editarItemSchema } from "./item";

const monedaId = "11111111-1111-1111-1111-111111111111";

describe("crearItemSchema", () => {
  it("fuerza stockActual: '0' y costoCompra: null para Servicio", () => {
    const result = crearItemSchema.safeParse({
      tipo: "SERVICIO",
      nombre: "Consultoría",
      precioVenta: "100.00",
      monedaId,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stockActual).toBe("0");
      expect(result.data.costoCompra).toBeNull();
    }
  });

  it("rechaza costoCompra o stockActual distinto de 0 para Servicio", () => {
    const result = crearItemSchema.safeParse({
      tipo: "SERVICIO",
      nombre: "Consultoría",
      precioVenta: "100.00",
      monedaId,
      stockActual: "5",
    });
    expect(result.success).toBe(false);
  });

  it("acepta Producto con costoCompra y stockActual", () => {
    const result = crearItemSchema.safeParse({
      tipo: "PRODUCTO",
      nombre: "Silla",
      precioVenta: "150.00",
      monedaId,
      costoCompra: "80.00",
      stockActual: "10",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza Producto sin costoCompra ni stockActual", () => {
    const result = crearItemSchema.safeParse({
      tipo: "PRODUCTO",
      nombre: "Silla",
      precioVenta: "150.00",
      monedaId,
    });
    expect(result.success).toBe(false);
  });

  it("rechaza un monto con formato inválido", () => {
    const result = crearItemSchema.safeParse({
      tipo: "SERVICIO",
      nombre: "Consultoría",
      precioVenta: "abc",
      monedaId,
    });
    expect(result.success).toBe(false);
  });
});

describe("editarItemSchema", () => {
  it("acepta editar nombre y precioVenta sin tocar tipo", () => {
    const result = editarItemSchema.safeParse({ nombre: "Silla reforzada", precioVenta: "160.00" });
    expect(result.success).toBe(true);
  });
});
