import { z } from "zod";
import { decimalStringSchema } from "./decimal";

export const registrarPagoCxCSchema = z.object({
  monto: decimalStringSchema.refine((val) => Number(val) > 0, "El monto debe ser mayor a cero"),
  cuentaFinancieraId: z.string().uuid(),
});
export type RegistrarPagoCxCInput = z.infer<typeof registrarPagoCxCSchema>;
