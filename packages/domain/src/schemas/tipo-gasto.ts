import { z } from "zod";

export const tipoGastoCamposLaboralSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio"),
  clasificacion: z.enum(["OPERATIVO", "FINANCIERO"], {
    required_error: "Seleccioná una clasificación",
  }),
});
export type TipoGastoCamposLaboralInput = z.infer<typeof tipoGastoCamposLaboralSchema>;

export const crearTipoGastoSchema = tipoGastoCamposLaboralSchema.extend({
  negocioId: z.string().uuid(),
});
export type CrearTipoGastoInput = z.infer<typeof crearTipoGastoSchema>;
