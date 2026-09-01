import { z } from "zod";

// Campos editables por el usuario, separados por ámbito para que la UI
// pueda validar client-side solo lo que el formulario de cada ámbito
// muestra (nunca deja elegir una clasificación que no corresponde).
export const tipoGastoCamposLaboralSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio"),
  clasificacion: z.enum(["OPERATIVO", "FINANCIERO"], {
    required_error: "Seleccioná una clasificación",
  }),
});
export type TipoGastoCamposLaboralInput = z.infer<typeof tipoGastoCamposLaboralSchema>;

export const tipoGastoCamposPersonalSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio"),
  clasificacion: z.enum(["FIJO", "VARIABLE", "FINANCIERO"], {
    required_error: "Seleccioná una clasificación",
  }),
});
export type TipoGastoCamposPersonalInput = z.infer<typeof tipoGastoCamposPersonalSchema>;

// No es posible guardar un tipo de gasto sin su clasificación (AC3), y la
// clasificación válida depende del ámbito (AC1/AC2) — un discriminated union
// sobre `ambito` rechaza en un solo schema tanto la clasificación ausente
// como la combinación ambito/clasificación inválida.
// [Source: architecture/database-schema.md#chk_tipo_gasto_ambito]
export const crearTipoGastoSchema = z.discriminatedUnion("ambito", [
  tipoGastoCamposLaboralSchema.extend({
    ambito: z.literal("LABORAL"),
    negocioId: z.string().uuid(),
  }),
  tipoGastoCamposPersonalSchema.extend({
    ambito: z.literal("PERSONAL"),
    negocioId: z.null(),
  }),
]);
export type CrearTipoGastoInput = z.infer<typeof crearTipoGastoSchema>;
