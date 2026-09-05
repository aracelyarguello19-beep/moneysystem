import { z } from "zod";
import { decimalStringSchema } from "./decimal";

// `esLibre`: venta "sobre pedido". `itemId` identifica un producto del
// catálogo cuando el vendedor lo eligió de las sugerencias; si en cambio
// tipeó un nombre que no matchea nada del catálogo, `itemId` queda vacío y
// `nombreLibre` es la única identificación de esa línea (nunca se crea un
// Item nuevo automáticamente). El costo lo tipea quien vende (no se lee del
// catálogo), por eso `costoUnitario` es obligatorio cuando `esLibre` es
// true — y como esa compra al proveedor mueve plata real, también son
// obligatorios `formaPagoProveedor`/`cuentaFinancieraProveedorId` (mismo
// criterio que `registrarCompraSchema`: cuenta obligatoria salvo
// CREDITO_PROVEEDOR) para que la salida de esa plata quede en el ledger.
export const ventaItemInputSchema = z
  .object({
    itemId: z.string().uuid().nullable().optional(),
    nombreLibre: z.string().trim().min(1).optional(),
    cantidad: decimalStringSchema.nullable(),
    precioUnitario: decimalStringSchema,
    costoServicio: decimalStringSchema.nullable().optional(),
    esLibre: z.boolean().optional().default(false),
    costoUnitario: decimalStringSchema.optional(),
    formaPagoProveedor: z.enum(["EFECTIVO", "BANCO", "TARJETA", "CREDITO_PROVEEDOR"]).optional(),
    cuentaFinancieraProveedorId: z.string().uuid().nullable().optional(),
  })
  .refine((data) => !data.esLibre || data.costoUnitario !== undefined, {
    message: "El costo es obligatorio en una venta libre",
    path: ["costoUnitario"],
  })
  .refine((data) => data.esLibre || !!data.itemId, {
    message: "itemId es obligatorio salvo venta libre",
    path: ["itemId"],
  })
  .refine((data) => !data.esLibre || !!data.itemId || !!data.nombreLibre?.trim(), {
    message: "Elegí un producto del catálogo o escribí un nombre",
    path: ["nombreLibre"],
  })
  .refine((data) => !data.esLibre || !!data.formaPagoProveedor, {
    message: "Elegí cómo le pagaste al proveedor",
    path: ["formaPagoProveedor"],
  })
  .refine(
    (data) =>
      !data.esLibre ||
      (data.formaPagoProveedor === "CREDITO_PROVEEDOR"
        ? !data.cuentaFinancieraProveedorId
        : !!data.cuentaFinancieraProveedorId),
    {
      message: "cuentaFinancieraProveedorId es obligatorio salvo forma de pago CREDITO_PROVEEDOR",
      path: ["cuentaFinancieraProveedorId"],
    }
  );
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
    // `registrarCompraSchema` (Story 5.3). El carrito/total de la venta
    // siempre quedan en la moneda base (Guaraníes) — `monedaId` acá es
    // solo la moneda en la que el cliente pagó. Cuando no es la base,
    // `cotizacion`/`montoRecibido` son obligatorios (validado en la
    // Server Action, que sí conoce si la moneda es base): `cotizacion` se
    // graba como un snapshot nuevo de TasaCambio (actualiza la "vigente"
    // que se ve en Caja) y `montoRecibido` es lo que se acredita en la
    // cuenta financiera de esa moneda — nunca el total en Gs.
    cuentaFinancieraId: z.string().uuid().nullable(),
    cotizacion: decimalStringSchema.optional(),
    montoRecibido: decimalStringSchema.optional(),
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
