import type { Item } from "../item";

// AC3: `costoServicio: null` se trata como 0 al calcular CSV, nunca como
// error. El agregado de CSV por negocio/período (sumando esto para todos los
// VentaItem tipo Servicio de un rango) es Story 5.1 — esta función solo
// resuelve la regla a nivel de un ítem individual, que esa story reutiliza.
// [Source: architecture/data-models.md#VentaItem]
export function costoServicioComoNumero(costoServicio: string | null): string {
  return costoServicio ?? "0";
}

// AC3: señaliza cuándo una línea de venta tipo Servicio no tiene costo
// registrado, para que la UI la marque como "dato incompleto" (Task 3).
export function esCostoServicioIncompleto(item: {
  tipo: Item["tipo"];
  costoServicio: string | null;
}): boolean {
  return item.tipo === "SERVICIO" && item.costoServicio === null;
}
