import type { Item } from "./item";

export type FormaPagoCompra = "EFECTIVO" | "BANCO" | "TARJETA" | "CREDITO_PROVEEDOR";

// [Source: architecture/data-models.md#Compra]
export interface Compra {
  id: string;
  negocioId: string;
  itemId: string;
  costoUnitario: string;
  cantidad: string;
  fecha: Date;
  proveedor: string | null;
  formaPago: FormaPagoCompra;
  cuentaFinancieraId: string | null; // null solo si CREDITO_PROVEEDOR
  monedaId: string;
  tasaCambioId: string | null; // null si moneda == base
  // false = generada automáticamente por una venta libre (sobre pedido):
  // registra el costo para el flujo de caja/balance sin sumar stock.
  afectaInventario: boolean;
}

export class ItemNoEsProductoError extends Error {
  constructor() {
    super("Solo se pueden registrar compras de ítems tipo Producto.");
    this.name = "ItemNoEsProductoError";
  }
}

// AC2: la compra solo admite ítems tipo Producto — un Servicio no aparece
// como opción en la UI (defensa en profundidad), y esta guardia lo rechaza
// también en la capa de datos si igual llegara un itemId de Servicio.
export function assertItemEsProducto(item: Pick<Item, "tipo">): void {
  if (item.tipo !== "PRODUCTO") {
    throw new ItemNoEsProductoError();
  }
}
