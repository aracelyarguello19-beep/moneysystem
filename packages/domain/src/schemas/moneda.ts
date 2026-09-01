import { z } from "zod";

// Campos editables por el usuario — separados del resto del schema para que
// la UI pueda validarlos client-side sin duplicar las reglas (ambito y
// negocioId los completa el propio código a partir del contexto, nunca el
// usuario).
export const monedaCamposSchema = z.object({
  codigo: z.string().trim().min(1, "El código es obligatorio").max(10),
  nombre: z.string().trim().min(1, "El nombre es obligatorio"),
});
export type MonedaCamposInput = z.infer<typeof monedaCamposSchema>;

// `ambito` determina si `negocioId` es obligatorio (LABORAL) o debe ser
// `null` (PERSONAL) — nunca ambas cosas a la vez.
// [Source: architecture/database-schema.md#chk_moneda_ambito]
export const crearMonedaSchema = z
  .object({
    ambito: z.enum(["LABORAL", "PERSONAL"]),
    negocioId: z.string().uuid().nullable(),
  })
  .merge(monedaCamposSchema)
  .refine(
    (data) =>
      data.ambito === "PERSONAL" ? data.negocioId === null : data.negocioId !== null,
    {
      message: "negocioId debe ser null en PERSONAL y obligatorio en LABORAL",
      path: ["negocioId"],
    }
  );
export type CrearMonedaInput = z.infer<typeof crearMonedaSchema>;
