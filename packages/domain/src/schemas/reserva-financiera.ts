import { z } from "zod";
import { decimalStringSchema } from "./decimal";

// No incluye `periodo`/`progresoAcumulado`/`ultimoPeriodoAplicado`:
// `periodo` es siempre 'MENSUAL' en este MVP, y los otros dos los gestiona
// exclusivamente el job de cierre de período (ADR-001), nunca el usuario.
// Pausar el aporte es `aportePorPeriodo: "0"` — no hay un campo `activa`
// separado (ver Dev Notes de Story 6.5).
export const configurarReservaSchema = z.object({
  objetivoMonto: decimalStringSchema.refine(
    (val) => Number(val) >= 0,
    "El objetivo no puede ser negativo"
  ),
  aportePorPeriodo: decimalStringSchema.refine(
    (val) => Number(val) >= 0,
    "El aporte no puede ser negativo"
  ),
});
export type ConfigurarReservaInput = z.infer<typeof configurarReservaSchema>;
