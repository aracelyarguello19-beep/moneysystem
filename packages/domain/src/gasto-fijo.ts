// Gasto recurrente (alquiler, sueldos, suscripciones, etc.), separado del
// registro día a día de Gasto. Su suma (solo los `activo: true`, en la
// moneda base del negocio) define la "meta mínima diaria" del Dashboard.
export interface GastoFijo {
  id: string;
  cuentaId: string;
  negocioId: string;
  nombre: string;
  monto: string;
  monedaId: string;
  activo: boolean;
}

const DIAS_HABILES_MES = 20;

// Suma de gastos fijos activos, sin dividir — el número "crudo" que
// `calcularMetaMinimaDiaria` divide por 20. Se muestra aparte en el
// Dashboard porque "meta mínima diaria" (un valor derivado) no reemplaza la
// necesidad de ver el total real de gastos fijos cargados.
export function calcularTotalGastosFijos(gastosFijos: Pick<GastoFijo, "monto" | "activo">[]): string {
  return gastosFijos
    .filter((g) => g.activo)
    .reduce((acc, g) => acc + Number(g.monto), 0)
    .toString();
}

// Meta mínima diaria = total de gastos fijos activos ÷ 20 días hábiles del
// mes. Es lo mínimo que hay que facturar por día solo para cubrir los costos
// fijos, antes de contar ganancia.
export function calcularMetaMinimaDiaria(gastosFijos: Pick<GastoFijo, "monto" | "activo">[]): string {
  const total = gastosFijos
    .filter((g) => g.activo)
    .reduce((acc, g) => acc + Number(g.monto), 0);
  return (total / DIAS_HABILES_MES).toString();
}
