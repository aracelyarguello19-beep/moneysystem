import { z } from "zod";

export const crearNegocioSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio"),
  tipo: z.enum(["PRODUCTOS", "SERVICIOS", "MIXTO"], {
    required_error: "Elegí a qué se dedica el negocio",
  }),
  logoUrl: z.string().url().nullable().optional(),
});
export type CrearNegocioInput = z.infer<typeof crearNegocioSchema>;

export const editarNegocioSchema = z.object({
  negocioId: z.string().uuid(),
  nombre: z.string().trim().min(1, "El nombre es obligatorio"),
  logoUrl: z.string().url().nullable().optional(),
});
export type EditarNegocioInput = z.infer<typeof editarNegocioSchema>;
