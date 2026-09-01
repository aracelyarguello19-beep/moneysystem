// [Source: architecture/data-models.md#TipoGasto]
export type ClasificacionGastoLaboral = "OPERATIVO" | "FINANCIERO";
export type ClasificacionGastoPersonal = "FIJO" | "VARIABLE" | "FINANCIERO"; // FINANCIERO agregado por ADR-002

export interface TipoGasto {
  id: string;
  cuentaId: string;
  negocioId: string | null;
  ambito: "LABORAL" | "PERSONAL";
  nombre: string;
  clasificacion: ClasificacionGastoLaboral | ClasificacionGastoPersonal;
}
