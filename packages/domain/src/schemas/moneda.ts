import { z } from "zod";

// Campos editables por el usuario — separados del resto del schema para que
// la UI pueda validarlos client-side sin duplicar las reglas (negocioId lo
// completa el propio código a partir del contexto, nunca el usuario).
export const monedaCamposSchema = z.object({
  codigo: z.string().trim().min(1, "El código es obligatorio").max(10),
  nombre: z.string().trim().min(1, "El nombre es obligatorio"),
});
export type MonedaCamposInput = z.infer<typeof monedaCamposSchema>;

export const crearMonedaSchema = z
  .object({
    negocioId: z.string().uuid(),
  })
  .merge(monedaCamposSchema);
export type CrearMonedaInput = z.infer<typeof crearMonedaSchema>;
