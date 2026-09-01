import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { calcularValorInventario } from "./inventario";

describe("calcularValorInventario", () => {
  it("calcula el valor por ítem (stock × costo) y el total agregado", () => {
    const resultado = calcularValorInventario([
      {
        id: "item-1",
        nombre: "Silla",
        tipo: "PRODUCTO",
        stockActual: new Prisma.Decimal("10"),
        costoCompra: new Prisma.Decimal("50.00"),
      },
      {
        id: "item-2",
        nombre: "Mesa",
        tipo: "PRODUCTO",
        stockActual: new Prisma.Decimal("2"),
        costoCompra: new Prisma.Decimal("200.00"),
      },
    ]);

    expect(resultado.items).toHaveLength(2);
    expect(resultado.items[0].valor).toBe("500");
    expect(resultado.items[1].valor).toBe("400");
    expect(resultado.total).toBe("900");
  });

  it("excluye ítems tipo SERVICIO del cálculo", () => {
    const resultado = calcularValorInventario([
      {
        id: "item-1",
        nombre: "Silla",
        tipo: "PRODUCTO",
        stockActual: new Prisma.Decimal("10"),
        costoCompra: new Prisma.Decimal("50.00"),
      },
      {
        id: "item-2",
        nombre: "Consultoría",
        tipo: "SERVICIO",
        stockActual: new Prisma.Decimal("0"),
        costoCompra: null,
      },
    ]);

    expect(resultado.items).toHaveLength(1);
    expect(resultado.items[0].itemId).toBe("item-1");
    expect(resultado.total).toBe("500");
  });

  it("devuelve total '0' cuando no hay productos", () => {
    const resultado = calcularValorInventario([]);
    expect(resultado.items).toHaveLength(0);
    expect(resultado.total).toBe("0");
  });
});
