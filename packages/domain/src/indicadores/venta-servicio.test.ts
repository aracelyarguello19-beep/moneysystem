import { describe, expect, it } from "vitest";
import { costoServicioComoNumero, esCostoServicioIncompleto } from "./venta-servicio";

describe("costoServicioComoNumero", () => {
  it("trata null como '0', sin lanzar error", () => {
    expect(costoServicioComoNumero(null)).toBe("0");
  });

  it("devuelve el valor tal cual cuando está presente", () => {
    expect(costoServicioComoNumero("35.50")).toBe("35.50");
  });
});

describe("esCostoServicioIncompleto", () => {
  it("marca como incompleto un Servicio sin costo", () => {
    expect(esCostoServicioIncompleto({ tipo: "SERVICIO", costoServicio: null })).toBe(true);
  });

  it("no marca como incompleto un Servicio con costo", () => {
    expect(esCostoServicioIncompleto({ tipo: "SERVICIO", costoServicio: "10.00" })).toBe(false);
  });

  it("nunca marca un Producto como incompleto (no aplica)", () => {
    expect(esCostoServicioIncompleto({ tipo: "PRODUCTO", costoServicio: null })).toBe(false);
  });
});
