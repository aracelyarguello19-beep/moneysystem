import { z } from "zod";
import { decimalStringSchema } from "./decimal";

// No incluye `clasificacion`: se hereda del `TipoGasto` elegido (AC3), no se
// vuelve a pedir acá. Tampoco incluye `ambito`/`negocioId`: esta story cubre
// exclusivamente el caso Laboral, `negocioId` viaja como parámetro explícito
// de la Server Action (mismo criterio que el resto de acciones del negocio).
export const registrarGastoSchema = z.object({
  tipoGastoId: z.string().uuid(),
  monto: decimalStringSchema.refine((val) => Number(val) > 0, "El monto debe ser mayor a cero"),
  monedaId: z.string().uuid(),
  fecha: z.coerce.date(),
  formaPago: z.enum(["EFECTIVO", "BANCO", "TARJETA"]),
  cuentaFinancieraId: z.string().uuid(),
});
export type RegistrarGastoInput = z.infer<typeof registrarGastoSchema>;
