import { z } from "zod";
import { decimalStringSchema } from "./decimal";

export const registrarTasaCambioSchema = z.object({
  tasa: decimalStringSchema.refine((val) => Number(val) > 0, "La tasa debe ser mayor a cero"),
});
export type RegistrarTasaCambioInput = z.infer<typeof registrarTasaCambioSchema>;
