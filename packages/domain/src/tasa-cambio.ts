import Decimal from "decimal.js";

// Snapshot inmutable de la tasa de cambio manual cargada por el usuario
// para una moneda no base — nunca se actualiza un registro existente, cada
// carga es una fila nueva (`insert`, nunca `update`).
// [Source: architecture/data-models.md#TasaCambio]
export interface TasaCambio {
  id: string;
  monedaId: string;
  tasa: string; // 1 unidad de monedaId = `tasa` Guaraníes
  vigenteDesde: Date;
  registradaPor: string; // cuentaId
}

// AC2/AC3/AC4: convierte un monto a Guaraníes usando una tasa YA RESUELTA
// (por quien llama, típicamente `resolverTasaCambioVigente` en
// packages/database, buscando la vigente a la fecha de la transacción) —
// esta función nunca decide qué tasa usar ni la busca, solo aplica la
// aritmética. Si `esMonedaBase` es true, retorna el monto sin cambios
// (Guaraní no se convierte contra sí mismo).
export function convertirAGuaranies(params: {
  monto: string;
  esMonedaBase: boolean;
  tasa: string | null; // tasa ya resuelta; null si esMonedaBase o no hay tasa cargada
}): string {
  if (params.esMonedaBase) return params.monto;
  if (params.tasa === null) return "0";
  return new Decimal(params.monto).times(params.tasa).toString();
}
