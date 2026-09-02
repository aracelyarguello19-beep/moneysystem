import { z } from "zod";
import { decimalStringSchema } from "./decimal";

// No incluye `clasificacion`: se hereda del `TipoGasto` elegido (AC3), no se
// vuelve a pedir acá. Tampoco incluye `negocioId`: viaja como parámetro
// explícito de la Server Action (mismo criterio que el resto de acciones del
// negocio). `ambito` sí lo elige el usuario: NEGOCIO (gasto del negocio) o
// PERSONAL (gasto del dueño pagado con la caja del negocio — reemplaza al
// viejo Retiro).
export const registrarGastoSchema = z.object({
  ambito: z.enum(["NEGOCIO", "PERSONAL"]),
  tipoGastoId: z.string().uuid(),
  monto: decimalStringSchema.refine((val) => Number(val) > 0, "El monto debe ser mayor a cero"),
  monedaId: z.string().uuid(),
  fecha: z.coerce.date(),
  formaPago: z.enum(["EFECTIVO", "BANCO", "TARJETA"]),
  cuentaFinancieraId: z.string().uuid(),
});
export type RegistrarGastoInput = z.infer<typeof registrarGastoSchema>;
