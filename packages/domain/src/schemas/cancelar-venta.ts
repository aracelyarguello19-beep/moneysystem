import { z } from "zod";
import { decimalStringSchema } from "./decimal";

// `itemsDevueltos` opcional: omitido → cancelación total (la Server Action
// calcula el pendiente de cada línea); presente → devolución parcial de las
// líneas/cantidades indicadas.
export const cancelarVentaSchema = z.object({
  itemsDevueltos: z
    .array(
      z.object({
        ventaItemId: z.string().uuid(),
        cantidad: decimalStringSchema.refine(
          (val) => Number(val) > 0,
          "La cantidad a devolver debe ser mayor a cero"
        ),
      })
    )
    .min(1, "Debe indicar al menos una línea a devolver")
    .optional(),
});
export type CancelarVentaInput = z.infer<typeof cancelarVentaSchema>;
