import { z } from "zod";

// Todo monto monetario viaja como string (Decimal serializado), nunca
// `number` — evita errores de precisión de punto flotante en dinero y
// refuerza NFR6 estructuralmente en el tipo.
// [Source: architecture/coding-standards.md#Critical Fullstack Rules]
export const decimalStringSchema = z
  .string()
  .refine((val) => /^\d+(\.\d{1,4})?$/.test(val), "Debe ser un monto numérico válido")
  .refine((val) => Number(val) >= 0, "El monto no puede ser negativo");
