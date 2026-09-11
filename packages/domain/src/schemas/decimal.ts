import { z } from "zod";

// Todo monto monetario viaja como string (Decimal serializado), nunca
// `number` — evita errores de precisión de punto flotante en dinero y
// refuerza NFR6 estructuralmente en el tipo.
// [Source: architecture/coding-standards.md#Critical Fullstack Rules]
export const decimalStringSchema = z
  .string()
  .refine((val) => /^\d+(\.\d{1,4})?$/.test(val), "Debe ser un monto numérico válido")
  .refine((val) => Number(val) >= 0, "El monto no puede ser negativo");

// Variante con signo — solo para `saldoActual` de CuentaFinanciera, el único
// monto que puede ser legítimamente negativo (tarjeta: negativo = deuda,
// ver comentario en CuentaFinanciera). Nunca usar para precios/costos/stock.
export const decimalSignedStringSchema = z
  .string()
  .refine((val) => /^-?\d+(\.\d{1,4})?$/.test(val), "Debe ser un monto numérico válido");
