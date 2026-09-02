import { z } from "zod";
import { decimalStringSchema } from "./decimal";

export const crearGastoFijoSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio"),
  monto: decimalStringSchema.refine((val) => Number(val) > 0, "El monto debe ser mayor a cero"),
  monedaId: z.string().uuid(),
});
export type CrearGastoFijoInput = z.infer<typeof crearGastoFijoSchema>;
