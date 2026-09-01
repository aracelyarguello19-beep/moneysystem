import { z } from "zod";
import { decimalStringSchema } from "./decimal";

// Story 4.3: solo CAJA/BANCO se crean por esta vía — TARJETA se gestiona en
// Story 4.2 (pasivo, no liquidez).
export const crearCuentaFinancieraSchema = z.object({
  tipo: z.enum(["CAJA", "BANCO"]),
  nombre: z.string().trim().min(1, "El nombre es obligatorio"),
  monedaId: z.string().uuid(),
});
export type CrearCuentaFinancieraInput = z.infer<typeof crearCuentaFinancieraSchema>;

export const registrarPagoResumenTarjetaSchema = z.object({
  monto: decimalStringSchema.refine((val) => Number(val) > 0, "El monto debe ser mayor a cero"),
  cuentaFinancieraId: z.string().uuid(),
});
export type RegistrarPagoResumenTarjetaInput = z.infer<typeof registrarPagoResumenTarjetaSchema>;

export const registrarInteresTarjetaSchema = z.object({
  monto: decimalStringSchema.refine((val) => Number(val) > 0, "El monto debe ser mayor a cero"),
  tipoGastoId: z.string().uuid(),
});
export type RegistrarInteresTarjetaInput = z.infer<typeof registrarInteresTarjetaSchema>;
