import { z } from "zod";
import { decimalStringSchema } from "./decimal";

// No incluye `negocioId`: viaja como parámetro explícito de la Server
// Action (mismo criterio que el resto de acciones del negocio). Tampoco
// incluye `origen`/`reglaId`: esta story cubre exclusivamente el retiro
// manual, siempre `origen: 'MANUAL'`, `reglaId: null` (Story 6.2 cubre el
// origen por regla).
export const registrarRetiroSchema = z.object({
  monto: decimalStringSchema.refine((val) => Number(val) > 0, "El monto debe ser mayor a cero"),
  cuentaFinancieraId: z.string().uuid(),
  fecha: z.coerce.date().optional(),
});
export type RegistrarRetiroInput = z.infer<typeof registrarRetiroSchema>;
