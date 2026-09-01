// Objetivo de reserva financiera y aporte por período (FR31) — vive
// enteramente en Personal, única por cuenta (no por negocio).
// `ultimoPeriodoAplicado` es la clave de idempotencia del job de cierre de
// período (ADR-001, `.ai/adr-001-cierre-de-periodo-automatico.md`),
// simétrica a `ReglaRetiro.ultimoPeriodoAplicado`.
// [Source: architecture/data-models.md#ReservaFinanciera]
export interface ReservaFinanciera {
  id: string;
  cuentaId: string;
  objetivoMonto: string;
  aportePorPeriodo: string;
  periodo: "MENSUAL";
  progresoAcumulado: string;
  ultimoPeriodoAplicado: string | null;
}

// Idempotencia del aporte automático (ADR-001, punto 7): se aplica si hay
// algo que aportar (`aportePorPeriodo > 0` — pausar el aporte es poner este
// valor en 0, no hay campo `activa`) y todavía no se aplicó en este
// período.
export function debeAplicarAporteReserva(
  reserva: Pick<ReservaFinanciera, "aportePorPeriodo" | "ultimoPeriodoAplicado">,
  periodoActual: string
): boolean {
  return Number(reserva.aportePorPeriodo) > 0 && reserva.ultimoPeriodoAplicado !== periodoActual;
}
