import Decimal from "decimal.js";

// Puente explícito entre un negocio y Personal (FR25-FR27): retiro manual
// (Story 6.1) o por regla predeterminada (Story 6.2, `reglaId`).
// [Source: architecture/data-models.md#RetiroUtilidad / ReglaRetiro]
export type OrigenRetiro = "MANUAL" | "REGLA";

export interface RetiroUtilidad {
  id: string;
  cuentaId: string;
  negocioId: string;
  monto: string;
  fecha: Date;
  origen: OrigenRetiro;
  reglaId: string | null;
}

// AC3: el retiro es siempre un monto explícito del usuario — nunca se
// deriva ni se sugiere como "ganancia líquida completa" por defecto. La
// ganancia líquida no retirada no tiene contrapartida en Personal: se
// deriva por diferencia (Ganancia Líquida del negocio menos esta suma),
// cálculo que es responsabilidad del balance personal (Story 6.5, fuera de
// alcance de esta story — Article IV, No Invention). Esta función solo suma
// lo efectivamente registrado.
export function sumarRetiros(retiros: Pick<RetiroUtilidad, "monto">[]): string {
  return retiros.reduce((acc, r) => acc.plus(r.monto), new Decimal(0)).toString();
}
