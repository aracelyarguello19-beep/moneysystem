import { z } from "zod";
import { decimalStringSchema } from "./decimal";

// Caja unificada: los 4 tipos se crean por esta misma vía. BANCO requiere
// `banco` (nombre del banco) para poder agrupar varias cuentas del mismo
// banco/moneda; `alias` es opcional para distinguirlas ("Cuenta 1"). OTRO
// requiere `detalleOtro` (texto libre). `nombre` es opcional: CAJA se
// nombra "Efectivo" por defecto server-side (Story rediseño Caja
// multimoneda) — el catálogo de Monedas se elimina, así que CAJA es la
// única vía para dar de alta una moneda nueva: `monedaCodigo` (texto libre,
// ej. "USD") reemplaza a `monedaId` para ese tipo — se busca o se crea la
// moneda server-side. BANCO/TARJETA/OTRO siguen eligiendo `monedaId` de una
// moneda ya existente, nunca crean una nueva.
export const crearCuentaFinancieraSchema = z
  .object({
    tipo: z.enum(["CAJA", "BANCO", "TARJETA", "OTRO"]),
    nombre: z.string().trim().min(1).optional(),
    monedaId: z.string().uuid().optional(),
    monedaCodigo: z.string().trim().min(1, "Escribí el código de la moneda").max(10).optional(),
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
  })
  .refine((data) => data.tipo !== "CAJA" || !!data.monedaCodigo, {
    message: "Escribí el código de la moneda",
    path: ["monedaCodigo"],
  })
  .refine((data) => data.tipo === "CAJA" || !!data.monedaId, {
    message: "Elegí la moneda",
    path: ["monedaId"],
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

// Ajuste manual de saldo (depósito inicial, corrección) sobre una cuenta
// Efectivo/Banco — nunca Tarjeta, esa solo se mueve vía pago de
// resumen/interés (ver registrarPagoResumenTarjetaSchema/registrarInteresTarjetaSchema).
export const registrarMovimientoManualSchema = z.object({
  cuentaFinancieraId: z.string().uuid(),
  monto: decimalStringSchema.refine((val) => Number(val) > 0, "El monto debe ser mayor a cero"),
});
export type RegistrarMovimientoManualInput = z.infer<typeof registrarMovimientoManualSchema>;
