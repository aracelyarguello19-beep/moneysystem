import { z } from "zod";

// No hay guidance específica en architecture docs para la forma exacta de
// `PeriodoFiltro` — se define como rango de fechas inclusive, el filtro más
// simple que cubre "un período seleccionado" (AC1).
export const periodoFiltroSchema = z.object({
  desde: z.coerce.date(),
  hasta: z.coerce.date(),
});
export type PeriodoFiltro = z.infer<typeof periodoFiltroSchema>;
