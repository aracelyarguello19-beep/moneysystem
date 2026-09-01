import Decimal from "decimal.js";

// Puente automático entre un negocio y Personal (FR26) — alternativa al
// retiro manual (Story 6.1). Única regla por negocio (`negocioId` único,
// AC3: "sin afectar la regla de otro negocio"). `ultimoPeriodoAplicado`
// ('YYYY-MM') es la clave de idempotencia del cron de cierre de período
// (ADR-001, `.ai/adr-001-cierre-de-periodo-automatico.md`).
// [Source: architecture/data-models.md#RetiroUtilidad / ReglaRetiro]
export type TipoRegla = "PORCENTAJE" | "MONTO_FIJO";

export interface ReglaRetiro {
  id: string;
  negocioId: string;
  tipo: TipoRegla;
  valor: string;
  periodo: "MENSUAL";
  activa: boolean;
  ultimoPeriodoAplicado: string | null;
}

// AC1: PORCENTAJE calcula sobre la Ganancia Líquida del período (Story
// 5.1); MONTO_FIJO usa el `valor` directamente, sin relación con la
// ganancia del período (la story no pide tope contra la ganancia real).
export function calcularMontoRetiroPorRegla(
  regla: Pick<ReglaRetiro, "tipo" | "valor">,
  gananciaLiquidaPeriodo: string
): string {
  if (regla.tipo === "MONTO_FIJO") return regla.valor;
  return new Decimal(gananciaLiquidaPeriodo)
    .times(regla.valor)
    .dividedBy(100)
    .toString();
}

// Idempotencia (ADR-001): una regla solo se aplica si está activa y todavía
// no se aplicó en este período — evita duplicar el retiro si el cron
// reintenta o corre más de una vez el mismo día de cierre.
export function debeAplicarRegla(
  regla: Pick<ReglaRetiro, "activa" | "ultimoPeriodoAplicado">,
  periodoActual: string
): boolean {
  return regla.activa && regla.ultimoPeriodoAplicado !== periodoActual;
}

// Formato 'YYYY-MM' del período mensual al que pertenece una fecha — mismo
// valor que se guarda en `ultimoPeriodoAplicado`. En UTC para que el cron
// (que corre a una hora fija UTC, ADR-001) sea determinístico sin importar
// el huso horario del servidor.
export function periodoMensualDe(fecha: Date): string {
  const yyyy = fecha.getUTCFullYear();
  const mm = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

// AC2/ADR-001: el cron corre diariamente pero solo debe actuar el último
// día calendario del mes (único período soportado, MENSUAL) — "mañana" cae
// en el día 1 del mes siguiente únicamente si hoy es el último día.
export function esUltimoDiaDelMes(fecha: Date): boolean {
  const manana = new Date(
    Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate() + 1)
  );
  return manana.getUTCDate() === 1;
}

// Rango [desde, hasta] del mes calendario al que pertenece `fecha` — el
// período MENSUAL completo que se usa para calcular la Ganancia Líquida
// base del retiro por PORCENTAJE.
export function rangoDelPeriodoMensual(fecha: Date): { desde: Date; hasta: Date } {
  const desde = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), 1));
  const hasta = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, 0));
  return { desde, hasta };
}
