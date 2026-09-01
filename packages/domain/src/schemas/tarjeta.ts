import { z } from "zod";
import { decimalStringSchema } from "./decimal";

// Ninguna story (4.1/4.2/4.3) define explícitamente una Server Action para
// dar de alta una tarjeta de crédito — Story 4.2 asume que la
// `CuentaFinanciera` tipo TARJETA "ya existe" y Story 4.3 excluye
// explícitamente TARJETA de `crearCuentaFinanciera`. Sin esto, la Story 4.2
// sería imposible de usar (no habría ninguna tarjeta sobre la que registrar
// consumos/pagos/intereses) — se agrega acá como el mínimo necesario para
// que la funcionalidad ya implementada sea alcanzable, no como una story
// nueva inventada.
export const crearTarjetaSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio"),
  monedaId: z.string().uuid(),
  limiteCredito: decimalStringSchema.nullable().optional(),
});
export type CrearTarjetaInput = z.infer<typeof crearTarjetaSchema>;
