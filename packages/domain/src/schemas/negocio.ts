import { z } from "zod";

export const crearNegocioSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio"),
});
export type CrearNegocioInput = z.infer<typeof crearNegocioSchema>;
