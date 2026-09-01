import { describe, expect, it } from "vitest";
import { assertNegocioActivo, NegocioArchivadoError } from "./negocio";

describe("assertNegocioActivo", () => {
  it("no lanza si el negocio está ACTIVO", () => {
    expect(() => assertNegocioActivo("ACTIVO")).not.toThrow();
  });

  it("lanza NegocioArchivadoError si el negocio está ARCHIVADO", () => {
    expect(() => assertNegocioActivo("ARCHIVADO")).toThrow(NegocioArchivadoError);
  });
});
