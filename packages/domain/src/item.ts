import Decimal from "decimal.js";

// [Source: architecture/data-models.md#Item]
export interface Item {
  id: string;
  negocioId: string;
  tipo: "PRODUCTO" | "SERVICIO";
  nombre: string;
  precioVenta: string; // Decimal serializado — nunca `number`
  monedaId: string;
  costoCompra: string | null;
  stockActual: string; // "0" para Servicio, siempre
  tieneMovimientos: boolean;
  imagenUrl: string | null;
}

export class TipoItemBloqueadoError extends Error {
  constructor() {
    super("No se puede cambiar el tipo de un ítem que ya tiene movimientos asociados.");
    this.name = "TipoItemBloqueadoError";
  }
}

// AC3: el tipo no puede cambiarse después de tener movimientos (compras o
// ventas) asociados, para no corromper el histórico de CMV/CSV. Función pura
// para poder testearla sin infraestructura — resolver el ítem actual bajo
// `withRlsContext` es responsabilidad de quien la invoca.
export function assertCambioDeTipoPermitido(
  itemActual: Pick<Item, "tipo" | "tieneMovimientos">,
  nuevoTipo: Item["tipo"] | undefined
): void {
  if (nuevoTipo && nuevoTipo !== itemActual.tipo && itemActual.tieneMovimientos) {
    throw new TipoItemBloqueadoError();
  }
}

export interface GananciaProducto {
  ganancia: string;
  margen: string; // porcentaje sobre el precio de venta — mismo criterio que `margenGanancia` en Indicadores (Story 5.1), nunca sobre el costo
}

// Vista previa en vivo al cargar una venta (no participa del cálculo
// oficial de indicadores — ese usa `costoUnitario` congelado en la venta,
// ver Story de "Costo por venta"). "0" en cualquier valor vacío/no numérico
// para no romper el formulario mientras el usuario está tipeando.
export function calcularGananciaProducto(
  precioVenta: string,
  costoCompra: string
): GananciaProducto {
  const precio = new Decimal(precioVenta || "0");
  const costo = new Decimal(costoCompra || "0");
  const ganancia = precio.minus(costo);
  const margen = precio.isZero() ? new Decimal(0) : ganancia.dividedBy(precio).times(100);
  return { ganancia: ganancia.toString(), margen: margen.toString() };
}
