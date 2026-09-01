import { z } from "zod";
import { decimalStringSchema } from "./decimal";

// `cuentaFinancieraId` es obligatorio salvo `CREDITO_PROVEEDOR` (refleja
// `chk_compra_medio_pago` de la migración — doble barrera).
// [Source: architecture/database-schema.md#chk_compra_medio_pago]
export const registrarCompraSchema = z
  .object({
    itemId: z.string().uuid(),
    costoUnitario: decimalStringSchema,
    cantidad: decimalStringSchema.refine(
      (val) => Number(val) > 0,
      "La cantidad debe ser mayor a cero"
    ),
    fecha: z.coerce.date(),
    proveedor: z.string().trim().min(1).optional(),
    formaPago: z.enum(["EFECTIVO", "BANCO", "TARJETA", "CREDITO_PROVEEDOR"]),
    cuentaFinancieraId: z.string().uuid().nullable(),
    monedaId: z.string().uuid(),
    // Sin `tasaCambioId`: nunca es el cliente quien decide qué tasa aplica
    // (Story 5.3, Coding Standard "Tasa de Cambio Inmutable") — la Server
    // Action la resuelve server-side según `monedaId`/`fecha` con
    // `resolverTasaCambioVigente`.
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
