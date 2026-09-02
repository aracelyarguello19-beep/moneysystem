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

// Meta mínima diaria = total de gastos fijos activos ÷ 20 días hábiles del
// mes. Es lo mínimo que hay que facturar por día solo para cubrir los costos
// fijos, antes de contar ganancia.
export function calcularMetaMinimaDiaria(gastosFijos: Pick<GastoFijo, "monto" | "activo">[]): string {
  const total = gastosFijos
    .filter((g) => g.activo)
    .reduce((acc, g) => acc + Number(g.monto), 0);
  return (total / DIAS_HABILES_MES).toString();
}
