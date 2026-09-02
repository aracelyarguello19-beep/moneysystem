import { z } from "zod";
import { decimalStringSchema } from "./decimal";

// `esLibre`: venta "sobre pedido" — el ítem elegido solo identifica el
// producto/modelo para el reporte, no descuenta stock. En ese caso el costo
// lo tipea quien vende (no se lee del catálogo), por eso `costoUnitario` es
// obligatorio cuando `esLibre` es true.
export const ventaItemInputSchema = z
  .object({
    itemId: z.string().uuid(),
    cantidad: decimalStringSchema.nullable(),
    precioUnitario: decimalStringSchema,
    costoServicio: decimalStringSchema.nullable().optional(),
    esLibre: z.boolean().optional().default(false),
    costoUnitario: decimalStringSchema.optional(),
  })
  .refine((data) => !data.esLibre || data.costoUnitario !== undefined, {
    message: "El costo es obligatorio en una venta libre",
    path: ["costoUnitario"],
  });
export type VentaItemInput = z.infer<typeof ventaItemInputSchema>;

// `cliente` y `cuentaFinancieraId` son mutuamente exclusivos con
// `formaCobro === 'CREDITO_CLIENTE'`: cliente pasa a ser obligatorio,
// cuentaFinancieraId pasa a ser prohibido — igual que `cuentaFinancieraId`
// en `registrarCompraSchema` (Story 2.2), reflejando la simetría entre
// "a crédito con proveedor" y "a crédito con cliente".
// [Source: architecture/data-models.md#Venta, Story 3.1 Task 5]
export const registrarVentaSchema = z
  .object({
    cliente: z.string().trim().min(1).optional(),
    formaCobro: z.enum(["EFECTIVO", "BANCO", "TARJETA", "CREDITO_CLIENTE"]),
    impuesto: decimalStringSchema,
    monedaId: z.string().uuid(),
    // Sin `tasaCambioId`: se resuelve server-side, mismo criterio que
    // `registrarCompraSchema` (Story 5.3).
    cuentaFinancieraId: z.string().uuid().nullable(),
    items: z.array(ventaItemInputSchema).min(1, "La venta debe tener al menos un ítem"),
  })
  .refine((data) => (data.formaCobro === "CREDITO_CLIENTE" ? !!data.cliente : true), {
    message: "El cliente es requerido cuando la forma de cobro es a crédito",
    path: ["cliente"],
  })
  .refine(
    (data) =>
      data.formaCobro === "CREDITO_CLIENTE"
        ? data.cuentaFinancieraId === null
        : data.cuentaFinancieraId !== null,
    {
      message: "cuentaFinancieraId es obligatorio salvo forma de cobro CREDITO_CLIENTE",
      path: ["cuentaFinancieraId"],
    }
  );
export type RegistrarVentaInput = z.infer<typeof registrarVentaSchema>;
