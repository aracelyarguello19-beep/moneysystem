import { z } from "zod";

export const crearNegocioSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio"),
  tipo: z.enum(["PRODUCTOS", "SERVICIOS", "MIXTO"], {
    required_error: "Elegí a qué se dedica el negocio",
  }),
});
export type CrearNegocioInput = z.infer<typeof crearNegocioSchema>;
