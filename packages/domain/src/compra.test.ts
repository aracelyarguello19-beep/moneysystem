import { describe, expect, it } from "vitest";
import { assertItemEsProducto, ItemNoEsProductoError } from "./compra";

describe("assertItemEsProducto", () => {
  it("no lanza para un ítem tipo PRODUCTO", () => {
    expect(() => assertItemEsProducto({ tipo: "PRODUCTO" })).not.toThrow();
  });

  it("lanza ItemNoEsProductoError para un ítem tipo SERVICIO", () => {
    expect(() => assertItemEsProducto({ tipo: "SERVICIO" })).toThrow(ItemNoEsProductoError);
  });
});
