import { z } from "zod";
import { decimalStringSchema } from "./decimal";

// Caja unificada: los 4 tipos se crean por esta misma vía. BANCO requiere
// `banco` (nombre del banco) para poder agrupar varias cuentas del mismo
// banco/moneda; `alias` es opcional para distinguirlas ("Cuenta 1"). OTRO
// requiere `detalleOtro` (texto libre).
export const crearCuentaFinancieraSchema = z
  .object({
    tipo: z.enum(["CAJA", "BANCO", "TARJETA", "OTRO"]),
    nombre: z.string().trim().min(1, "El nombre es obligatorio"),
    monedaId: z.string().uuid(),
    banco: z.string().trim().min(1).optional(),
    alias: z.string().trim().min(1).optional(),
    detalleOtro: z.string().trim().min(1).optional(),
    limiteCredito: decimalStringSchema.nullable().optional(),
  })
  .refine((data) => data.tipo !== "BANCO" || !!data.banco, {
    message: "Elegí el banco",
    path: ["banco"],
  })
  .refine((data) => data.tipo !== "OTRO" || !!data.detalleOtro, {
    message: "Describí de qué se trata",
    path: ["detalleOtro"],
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
