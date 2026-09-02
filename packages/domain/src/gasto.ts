import type { TipoGasto } from "./tipo-gasto";

export type FormaPagoGasto = "EFECTIVO" | "BANCO" | "TARJETA";

// NEGOCIO = gasto del propio negocio; PERSONAL = gasto personal del dueño
// pagado con la caja del negocio (reemplaza al viejo Retiro de utilidad —
// mismo movimiento de caja, categorizado como gasto en vez de un concepto
// aparte). `negocioId` siempre presente: el ámbito global "Personal" (fuera
// de cualquier negocio) ya no existe en el sistema.
export type AmbitoGasto = "NEGOCIO" | "PERSONAL";

// [Source: architecture/data-models.md#Gasto]
export interface Gasto {
  id: string;
  cuentaId: string;
  negocioId: string;
  ambito: AmbitoGasto;
  tipoGastoId: string;
  monto: string;
  monedaId: string;
  fecha: Date;
  formaPago: FormaPagoGasto;
  cuentaFinancieraId: string;
}

export class TipoGastoAmbitoInvalidoError extends Error {
  constructor(esperado: TipoGasto["ambito"] = "LABORAL") {
    super(
      esperado === "LABORAL"
        ? "El tipo de gasto elegido no corresponde al ámbito Laboral del negocio activo."
        : "El tipo de gasto elegido no corresponde al catálogo Personal."
    );
    this.name = "TipoGastoAmbitoInvalidoError";
  }
}

// AC1: un gasto del negocio activo (Laboral) solo puede clasificarse con un
// TipoGasto del catálogo Laboral — nunca uno Personal, aunque RLS lo deje
// visible (la policy compuesta de `tipos_gasto` permite negocio_id IS NULL
// incluso con un negocio activo seteado, porque Personal necesita ser
// visible desde cualquier contexto).
export function assertTipoGastoLaboral(tipoGasto: Pick<TipoGasto, "ambito">): void {
  if (tipoGasto.ambito !== "LABORAL") {
    throw new TipoGastoAmbitoInvalidoError("LABORAL");
  }
}

export class TipoGastoClasificacionInvalidaError extends Error {
  constructor() {
    super("El tipo de gasto elegido debe tener clasificación Financiero.");
    this.name = "TipoGastoClasificacionInvalidaError";
  }
}

// AC2 (Story 4.2): un interés/cargo de tarjeta se registra siempre como
// Gasto Financiero — nunca Operativo.
export function assertTipoGastoFinanciero(tipoGasto: Pick<TipoGasto, "clasificacion">): void {
  if (tipoGasto.clasificacion !== "FINANCIERO") {
    throw new TipoGastoClasificacionInvalidaError();
  }
}

// AC3: la clasificación Operativo/Financiero se hereda del TipoGasto elegido
// (fijada al crear el catálogo en Story 1.7) — el usuario nunca la elige de
// nuevo al cargar un gasto puntual. Función trivial pero documenta la
// intención arquitectónica y es lo que testea Task 5.
export function obtenerClasificacionGasto(
  tipoGasto: Pick<TipoGasto, "clasificacion">
): TipoGasto["clasificacion"] {
  return tipoGasto.clasificacion;
}
