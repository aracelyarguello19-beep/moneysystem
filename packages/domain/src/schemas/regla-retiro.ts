import { z } from "zod";
import { decimalStringSchema } from "./decimal";

// No incluye `negocioId`: viaja como parámetro explícito de la Server
// Action (mismo criterio que el resto de acciones del negocio). Tampoco
// incluye `periodo`/`ultimoPeriodoAplicado`: `periodo` es siempre 'MENSUAL'
// en este MVP (no hay otra opción que ofrecer) y `ultimoPeriodoAplicado` lo
// gestiona exclusivamente el job de cierre de período (ADR-001), nunca el
// usuario.
export const configurarReglaRetiroSchema = z
  .object({
    tipo: z.enum(["PORCENTAJE", "MONTO_FIJO"]),
    valor: decimalStringSchema.refine((val) => Number(val) > 0, "El valor debe ser mayor a cero"),
    activa: z.boolean(),
  })
  .refine((data) => data.tipo !== "PORCENTAJE" || Number(data.valor) <= 100, {
    message: "El porcentaje no puede ser mayor a 100",
    path: ["valor"],
  });
export type ConfigurarReglaRetiroInput = z.infer<typeof configurarReglaRetiroSchema>;
