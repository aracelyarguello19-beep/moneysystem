import { describe, expect, it } from "vitest";
import { decimalSignedStringSchema, decimalStringSchema } from "./decimal";

describe("decimalStringSchema", () => {
  it("rechaza negativos", () => {
    expect(decimalStringSchema.safeParse("-10").success).toBe(false);
  });

  it("acepta enteros y decimales de hasta 4 dígitos", () => {
    expect(decimalStringSchema.safeParse("10").success).toBe(true);
    expect(decimalStringSchema.safeParse("10.1234").success).toBe(true);
  });
});

describe("decimalSignedStringSchema", () => {
  it("acepta negativos (deuda de tarjeta)", () => {
    expect(decimalSignedStringSchema.safeParse("-500.50").success).toBe(true);
  });

  it("acepta positivos y cero", () => {
    expect(decimalSignedStringSchema.safeParse("500").success).toBe(true);
    expect(decimalSignedStringSchema.safeParse("0").success).toBe(true);
  });

  it("rechaza formato inválido", () => {
    expect(decimalSignedStringSchema.safeParse("abc").success).toBe(false);
    expect(decimalSignedStringSchema.safeParse("--5").success).toBe(false);
  });
});
