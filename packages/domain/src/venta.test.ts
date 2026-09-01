import { describe, expect, it } from "vitest";
import {
  assertCantidadValidaParaVentaItem,
  assertCostoServicioValido,
  assertDevolucionValida,
  calcularEstadoVenta,
  calcularTotalVenta,
  CantidadRequeridaError,
  CostoServicioInvalidoError,
  DevolucionExcedeCantidadError,
} from "./venta";

describe("assertCantidadValidaParaVentaItem", () => {
  it("no lanza para Producto con cantidad válida", () => {
    expect(() => assertCantidadValidaParaVentaItem({ tipo: "PRODUCTO" }, "3")).not.toThrow();
  });

  it("lanza para Producto sin cantidad", () => {
    expect(() => assertCantidadValidaParaVentaItem({ tipo: "PRODUCTO" }, null)).toThrow(
      CantidadRequeridaError
    );
  });

  it("lanza para Producto con cantidad cero", () => {
    expect(() => assertCantidadValidaParaVentaItem({ tipo: "PRODUCTO" }, "0")).toThrow(
      CantidadRequeridaError
    );
  });

  it("no lanza para Servicio sin cantidad", () => {
    expect(() => assertCantidadValidaParaVentaItem({ tipo: "SERVICIO" }, null)).not.toThrow();
  });
});

describe("assertCostoServicioValido", () => {
  it("no lanza para Servicio con costo", () => {
    expect(() => assertCostoServicioValido({ tipo: "SERVICIO" }, "50.00")).not.toThrow();
  });

  it("no lanza para Servicio sin costo (null)", () => {
    expect(() => assertCostoServicioValido({ tipo: "SERVICIO" }, null)).not.toThrow();
  });

  it("lanza para Producto con costoServicio presente", () => {
    expect(() => assertCostoServicioValido({ tipo: "PRODUCTO" }, "50.00")).toThrow(
      CostoServicioInvalidoError
    );
  });

  it("no lanza para Producto sin costoServicio", () => {
    expect(() => assertCostoServicioValido({ tipo: "PRODUCTO" }, null)).not.toThrow();
  });
});

describe("assertDevolucionValida", () => {
  it("no lanza cuando la cantidad a devolver está dentro de lo pendiente", () => {
    expect(() =>
      assertDevolucionValida({ cantidad: "10", cantidadDevuelta: "2" }, "5")
    ).not.toThrow();
  });

  it("lanza cuando la cantidad a devolver excede lo pendiente", () => {
    expect(() =>
      assertDevolucionValida({ cantidad: "10", cantidadDevuelta: "8" }, "5")
    ).toThrow(DevolucionExcedeCantidadError);
  });

  it("trata un Servicio sin cantidad como 1 unidad devolvible", () => {
    expect(() =>
      assertDevolucionValida({ cantidad: null, cantidadDevuelta: "0" }, "1")
    ).not.toThrow();
    expect(() =>
      assertDevolucionValida({ cantidad: null, cantidadDevuelta: "0" }, "2")
    ).toThrow(DevolucionExcedeCantidadError);
  });
});

describe("calcularEstadoVenta", () => {
  it("devuelve ACTIVA cuando ninguna línea tiene devolución", () => {
    const estado = calcularEstadoVenta([
      { cantidad: "10", cantidadDevuelta: "0" },
      { cantidad: null, cantidadDevuelta: "0" },
    ]);
    expect(estado).toBe("ACTIVA");
  });

  it("devuelve DEVUELTA_PARCIAL cuando hay devolución parcial", () => {
    const estado = calcularEstadoVenta([
      { cantidad: "10", cantidadDevuelta: "3" },
      { cantidad: null, cantidadDevuelta: "0" },
    ]);
    expect(estado).toBe("DEVUELTA_PARCIAL");
  });

  it("devuelve CANCELADA cuando todas las líneas están totalmente devueltas", () => {
    const estado = calcularEstadoVenta([
      { cantidad: "10", cantidadDevuelta: "10" },
      { cantidad: null, cantidadDevuelta: "1" },
    ]);
    expect(estado).toBe("CANCELADA");
  });
});

describe("calcularTotalVenta", () => {
  it("calcula el total de una venta mixta producto+servicio", () => {
    const total = calcularTotalVenta([
      { precioUnitario: "100.00", cantidad: "2" }, // producto: 200
      { precioUnitario: "50.00", cantidad: null }, // servicio: cuenta como 1 -> 50
    ]);
    expect(total).toBe("250");
  });

  it("devuelve '0' para una lista vacía", () => {
    expect(calcularTotalVenta([])).toBe("0");
  });
});
