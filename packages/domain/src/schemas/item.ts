import { z } from "zod";
import { decimalStringSchema } from "./decimal";

// Un ítem Producto tiene costo de compra y stock editables; un ítem Servicio
// nunca genera stock (AC2) — el schema fuerza `costoCompra: null` y
// `stockActual: "0"` para Servicio en vez de solo documentarlo (doble
// barrera junto al check constraint `chk_item_servicio_sin_stock`).
// [Source: architecture/data-models.md#Item, architecture/database-schema.md]
export const crearItemSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("PRODUCTO"),
    nombre: z.string().trim().min(1, "El nombre es obligatorio"),
    precioVenta: decimalStringSchema,
    monedaId: z.string().uuid(),
    costoCompra: decimalStringSchema,
    stockActual: decimalStringSchema,
    imagenUrl: z.string().url().optional(),
    // Identidad de variante (ej. número de calce) y proveedor habitual —
    // solo tiene sentido para Producto, nunca para Servicio.
    nroCalce: z.string().trim().min(1).optional(),
    proveedor: z.string().trim().min(1).optional(),
  }),
  z.object({
    tipo: z.literal("SERVICIO"),
    nombre: z.string().trim().min(1, "El nombre es obligatorio"),
    precioVenta: decimalStringSchema,
    monedaId: z.string().uuid(),
    costoCompra: z.null().default(null),
    stockActual: z.literal("0").default("0"),
    imagenUrl: z.string().url().optional(),
  }),
]);
export type CrearItemInput = z.infer<typeof crearItemSchema>;

// Solo campos no estructurales (AC4). `tipo` es opcional: AC3 permite
// cambiarlo mientras el ítem no tenga movimientos asociados — la Server
// Action decide si se acepta según `tieneMovimientos`, no este schema.
export const editarItemSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio"),
  precioVenta: decimalStringSchema,
  tipo: z.enum(["PRODUCTO", "SERVICIO"]).optional(),
  imagenUrl: z.string().url().nullable().optional(),
});
export type EditarItemInput = z.infer<typeof editarItemSchema>;
