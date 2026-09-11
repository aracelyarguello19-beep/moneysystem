import { z } from "zod";
import { decimalStringSchema } from "./decimal";

// `monedaId`/`cotizacion` son por línea (no por compra): dos productos de la
// misma compra pueden venir de proveedores en monedas distintas. `cotizacion`
// solo es obligatoria cuando esa línea no está en la moneda oficial — se
// valida server-side (ver registrar-compra.ts) porque acá no se sabe todavía
// cuál moneda es la base.
export const lineaCompraSchema = z.object({
  itemId: z.string().uuid(),
  costoUnitario: decimalStringSchema,
  cantidad: decimalStringSchema.refine(
    (val) => Number(val) > 0,
    "La cantidad debe ser mayor a cero"
  ),
  monedaId: z.string().uuid(),
  cotizacion: decimalStringSchema.optional(),
});
export type LineaCompraInput = z.infer<typeof lineaCompraSchema>;

// `cuentaFinancieraId` es obligatorio salvo `CREDITO_PROVEEDOR` (refleja
// `chk_compra_medio_pago` de la migración — doble barrera). `items` admite
// una compra de varios productos a la vez (mismo proveedor/fecha/forma de
// pago/cuenta) — cada línea crea su propia fila de `Compra` y actualiza su
// propio ítem, ver registrar-compra.ts.
// [Source: architecture/database-schema.md#chk_compra_medio_pago]
export const registrarCompraSchema = z
  .object({
    items: z.array(lineaCompraSchema).min(1, "Agregá al menos un producto"),
    fecha: z.coerce.date(),
    proveedor: z.string().trim().min(1).optional(),
    formaPago: z.enum(["EFECTIVO", "BANCO", "TARJETA", "CREDITO_PROVEEDOR"]),
    cuentaFinancieraId: z.string().uuid().nullable(),
    // Sin `tasaCambioId`: nunca es el cliente quien decide qué tasa aplica
    // (Story 5.3, Coding Standard "Tasa de Cambio Inmutable") — la Server
    // Action crea un snapshot nuevo de TasaCambio por cada línea en moneda
    // extranjera, a partir de la `cotizacion` que se cargó acá.
  })
  .refine(
    (data) =>
      data.formaPago === "CREDITO_PROVEEDOR"
        ? data.cuentaFinancieraId === null
        : data.cuentaFinancieraId !== null,
    {
      message: "cuentaFinancieraId es obligatorio salvo forma de pago CREDITO_PROVEEDOR",
      path: ["cuentaFinancieraId"],
    }
  );
export type RegistrarCompraInput = z.infer<typeof registrarCompraSchema>;
