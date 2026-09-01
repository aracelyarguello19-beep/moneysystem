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
