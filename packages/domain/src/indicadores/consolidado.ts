import Decimal from "decimal.js";
import { convertirAGuaranies } from "../tasa-cambio";
import type { IndicadoresFinancieros } from "./indicadores";

// Story 5.4: el dashboard consolidado no incluye `desglose` producto/
// servicio (Story 5.2) — el AC1 de esta story solo pide la cadena
// Ingresos Brutos → Ganancia Líquida y Margen, no el desglose por tipo de
// ítem cruzando negocios distintos (cada uno con su propio catálogo).
export type TotalesFinancieros = Omit<IndicadoresFinancieros, "desglose">;

export function totalesDesdeIndicadores(indicadores: IndicadoresFinancieros): TotalesFinancieros {
  const { desglose: _desglose, ...totales } = indicadores;
  return totales;
}

export interface NegocioIndicadorConsolidable {
  negocioId: string;
  nombre: string;
  indicadores: IndicadoresFinancieros; // en la moneda nativa de ese negocio (Story 5.1)
  esMonedaBase: boolean;
  tasa: string | null; // tasa histórica para convertir a Guaraníes, si no es base
}

export interface ConsolidadoIndicadores {
  indicadoresConsolidados: TotalesFinancieros; // sumados en Guaraníes; margen recalculado, no promediado
  porNegocio: { negocioId: string; nombre: string; indicadoresEnGuaranies: TotalesFinancieros }[];
}

const CAMPOS_A_SUMAR = [
  "ingresosBrutos",
  "ingresosNetos",
  "cmv",
  "csv",
  "gananciaBruta",
  "gastosOperativos",
  "resultadoOperativo",
  "gastosFinancieros",
  "gananciaLiquida",
] as const;

// AC1/AC4 (Story 5.4): cada negocio se convierte primero, completo, a
// Guaraníes con su propia tasa histórica — recién ahí se suma entre
// negocios. El Margen de Ganancia consolidado se RECALCULA sobre los
// totales ya sumados (Task 2), nunca promediando los márgenes individuales
// (promediar márgenes de negocios con distinta escala de ingresos daría un
// número sin sentido económico).
export function consolidarIndicadoresPorNegocio(
  negocios: NegocioIndicadorConsolidable[]
): ConsolidadoIndicadores {
  const porNegocio = negocios.map((n) => {
    const totalesNativos = totalesDesdeIndicadores(n.indicadores);
    const enGuaranies = Object.fromEntries(
      CAMPOS_A_SUMAR.map((campo) => [
        campo,
        convertirAGuaranies({ monto: totalesNativos[campo], esMonedaBase: n.esMonedaBase, tasa: n.tasa }),
      ])
    ) as Record<(typeof CAMPOS_A_SUMAR)[number], string>;

    return {
      negocioId: n.negocioId,
      nombre: n.nombre,
      indicadoresEnGuaranies: { ...enGuaranies, margenGanancia: "0" } as TotalesFinancieros,
    };
  });

  const totales = Object.fromEntries(
    CAMPOS_A_SUMAR.map((campo) => [
      campo,
      porNegocio
        .reduce((acc, n) => acc.plus(n.indicadoresEnGuaranies[campo]), new Decimal(0))
        .toString(),
    ])
  ) as Record<(typeof CAMPOS_A_SUMAR)[number], string>;

  const ingresosNetos = new Decimal(totales.ingresosNetos);
  const gananciaLiquida = new Decimal(totales.gananciaLiquida);
  const margenGanancia = ingresosNetos.isZero()
    ? new Decimal(0)
    : gananciaLiquida.dividedBy(ingresosNetos);

  // Cada negocio individual conserva su propio margen (sobre sus propios
  // totales ya en Guaraníes) para el detalle por negocio del AC2/AC5-equivalente.
  const porNegocioConMargen = porNegocio.map((n) => {
    const ingresosNetosNegocio = new Decimal(n.indicadoresEnGuaranies.ingresosNetos);
    const margenNegocio = ingresosNetosNegocio.isZero()
      ? new Decimal(0)
      : new Decimal(n.indicadoresEnGuaranies.gananciaLiquida).dividedBy(ingresosNetosNegocio);
    return {
      ...n,
      indicadoresEnGuaranies: { ...n.indicadoresEnGuaranies, margenGanancia: margenNegocio.toString() },
    };
  });

  return {
    indicadoresConsolidados: { ...totales, margenGanancia: margenGanancia.toString() },
    porNegocio: porNegocioConMargen,
  };
}
