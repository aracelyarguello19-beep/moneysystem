// Formato de montos: separador de miles con punto, decimal con coma
// (`es-PY`) — así se leen los números en Paraguay, y es lo que pidió el
// usuario explícitamente (Gs 100.000, no Gs 100,000). Guaraní no tiene
// centavos de uso práctico (nunca se factura con decimales), así que va sin
// decimales; Real y Dólar sí tienen centavos, van con 2. Cualquier código de
// moneda no listado (una moneda que el usuario agregue a mano en el
// catálogo) cae al mismo criterio "con decimales" de USD/BRL, no al de PYG.
const DECIMALES_SIN_CENTAVOS = new Set(["PYG"]);

// Prefijo tal cual se pidió: "Gs 100.000", "R$ 100.000", "USD 100.000" —
// símbolo/código antes del número, separado por un espacio. Sin entrada acá
// (moneda custom) se usa su propio `codigo` como prefijo.
const PREFIJOS: Record<string, string> = {
  PYG: "Gs",
  BRL: "R$",
  USD: "USD",
};

// `codigoMoneda` es opcional: hay pantallas (KPIs consolidados del
// Dashboard, por ejemplo) que todavía no traen la moneda del valor que
// muestran — en ese caso se formatea el número igual, sin prefijo, en vez de
// inventar una moneda que no se confirmó.
export function formatearMonto(monto: string | number | null | undefined, codigoMoneda?: string | null): string {
  const numero = Number(monto ?? 0);
  const decimales = codigoMoneda && DECIMALES_SIN_CENTAVOS.has(codigoMoneda) ? 0 : codigoMoneda ? 2 : 0;
  const formateado = new Intl.NumberFormat("es-PY", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(numero);

  if (!codigoMoneda) return formateado;
  const prefijo = PREFIJOS[codigoMoneda] ?? codigoMoneda;
  return `${prefijo} ${formateado}`;
}
