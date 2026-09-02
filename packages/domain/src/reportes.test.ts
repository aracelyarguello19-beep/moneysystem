import { describe, expect, it } from "vitest";
import { calcularProductosVendidos, calcularResumenGastos } from "./reportes";

describe("calcularProductosVendidos", () => {
  it("agrupa por ítem y ordena de mayor a menor cantidad vendida", () => {
    const resultado = calcularProductosVendidos([
      { itemId: "a", itemNombre: "Tenis Nike", cantidad: "2", precioUnitario: "100", cantidadDevuelta: "0" },
      { itemId: "a", itemNombre: "Tenis Nike", cantidad: "1", precioUnitario: "100", cantidadDevuelta: "0" },
      { itemId: "b", itemNombre: "Tenis Adidas", cantidad: "5", precioUnitario: "80", cantidadDevuelta: "0" },
    ]);

    expect(resultado[0]).toMatchObject({ itemId: "b", cantidadVendida: "5", ingresos: "400" });
    expect(resultado[1]).toMatchObject({ itemId: "a", cantidadVendida: "3", ingresos: "300" });
  });

  it("descuenta las devoluciones y excluye líneas totalmente devueltas", () => {
    const resultado = calcularProductosVendidos([
      { itemId: "a", itemNombre: "Tenis Nike", cantidad: "3", precioUnitario: "100", cantidadDevuelta: "1" },
      { itemId: "b", itemNombre: "Tenis Adidas", cantidad: "2", precioUnitario: "80", cantidadDevuelta: "2" },
    ]);

    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({ itemId: "a", cantidadVendida: "2", ingresos: "200" });
  });
});

describe("calcularResumenGastos", () => {
  it("agrupa por tipo de gasto y ámbito, ordena de mayor a menor total", () => {
    const resultado = calcularResumenGastos([
      { tipoGastoId: "t1", tipoGastoNombre: "Insumos", clasificacion: "OPERATIVO", ambito: "NEGOCIO", monto: "100" },
      { tipoGastoId: "t1", tipoGastoNombre: "Insumos", clasificacion: "OPERATIVO", ambito: "NEGOCIO", monto: "50" },
      { tipoGastoId: "t2", tipoGastoNombre: "Retiro personal", clasificacion: "OPERATIVO", ambito: "PERSONAL", monto: "300" },
    ]);

    expect(resultado[0]).toMatchObject({ nombre: "Retiro personal", ambito: "PERSONAL", total: "300" });
    expect(resultado[1]).toMatchObject({ nombre: "Insumos", ambito: "NEGOCIO", total: "150" });
  });
});
