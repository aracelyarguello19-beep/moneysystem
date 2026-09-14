import { z } from "zod";
import { decimalSignedStringSchema, decimalStringSchema } from "./decimal";

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

// Edición de campos no estructurales: nombre siempre editable; `limiteCredito`
// solo tiene sentido para TARJETA pero se deja pasar `null`/`undefined` para
// el resto sin romper el schema. `saldoActual` es el valor que el usuario
// quiere ver reflejado (no un delta) — con signo porque en TARJETA negativo
// = deuda; la Server Action calcula la diferencia contra el saldo actual y
// la aplica como un movimiento más (`aplicarMovimientoCuenta`/
// `aplicarMovimientoTarjeta`), nunca pisando la columna directo, para que
// la corrección quede auditada igual que cualquier otro movimiento (ver
// ledger.ts).
export const editarCuentaFinancieraSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio"),
  limiteCredito: decimalStringSchema.nullable().optional(),
  saldoActual: decimalSignedStringSchema.optional(),
});
export type EditarCuentaFinancieraInput = z.infer<typeof editarCuentaFinancieraSchema>;

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
// `tipo` (INGRESO/EGRESO, default INGRESO por compatibilidad con el
// comportamiento previo) permite corregir el saldo hacia abajo sin tocar
// `saldoActual` directamente — ambos casos pasan por `aplicarMovimientoCuenta`,
// así que el ajuste siempre queda auditado en `movimientos_cuenta`.
export const registrarMovimientoManualSchema = z.object({
  cuentaFinancieraId: z.string().uuid(),
  monto: decimalStringSchema.refine((val) => Number(val) > 0, "El monto debe ser mayor a cero"),
  tipo: z.enum(["INGRESO", "EGRESO"]).default("INGRESO"),
});
export type RegistrarMovimientoManualInput = z.infer<typeof registrarMovimientoManualSchema>;

// Compra de moneda extranjera con efectivo en Gs, desde la tarjeta de una
// cuenta CAJA extranjera (Caja) — `monto` es cuánto de esa moneda se
// compró (ej. 100 si son R$ 100), `cotizacion` es a cuánto se compró (1
// unidad de esa moneda = `cotizacion` Gs). La Server Action calcula `monto
// × cotizacion` para debitar la cuenta de origen (Gs) y acredita `monto`
// tal cual en la de destino — nunca al revés, ver comprar-moneda.ts.
export const comprarMonedaSchema = z.object({
  cuentaFinancieraOrigenId: z.string().uuid(),
  cuentaFinancieraDestinoId: z.string().uuid(),
  monto: decimalStringSchema.refine((val) => Number(val) > 0, "El monto debe ser mayor a cero"),
  cotizacion: decimalStringSchema.refine((val) => Number(val) > 0, "La cotización debe ser mayor a cero"),
});
export type ComprarMonedaInput = z.infer<typeof comprarMonedaSchema>;

// Transferencia entre 2 cuentas Efectivo/Banco de la MISMA moneda — nunca
// convierte (para eso está `comprarMonedaSchema`): mover plata de una caja
// a un banco, o entre dos bancos, en la misma moneda no cambia el total,
// solo dónde está guardada.
export const transferirEntreCuentasSchema = z
  .object({
    cuentaFinancieraOrigenId: z.string().uuid(),
    cuentaFinancieraDestinoId: z.string().uuid(),
    monto: decimalStringSchema.refine((val) => Number(val) > 0, "El monto debe ser mayor a cero"),
  })
  .refine((data) => data.cuentaFinancieraOrigenId !== data.cuentaFinancieraDestinoId, {
    message: "Elegí una cuenta de destino distinta a la de origen",
    path: ["cuentaFinancieraDestinoId"],
  });
export type TransferirEntreCuentasInput = z.infer<typeof transferirEntreCuentasSchema>;
