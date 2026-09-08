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

// Nombre para mostrar en vez del código — se usa donde el código solo (o
// "Caja (USD)") no es lo suficientemente claro para quien no vive mirando
// códigos ISO (ej. las tarjetas de saldo por moneda en Caja/Dashboard).
// `Moneda.nombre` en la base queda igual al código al crearla
// (`buscarOCrearMoneda`, no hay edición de nombre todavía), así que esto
// vive acá en vez de en el dato — una moneda que el usuario agregue a mano
// con un código no listado cae al mismo criterio "mostrar el código tal
// cual" que ya usa `formatearMonto`.
const NOMBRES_MONEDA: Record<string, string> = {
  PYG: "Guaraní",
  BRL: "Real",
  USD: "Dólar",
};

export function nombreMoneda(codigo: string | null | undefined): string {
  if (!codigo) return "";
  return NOMBRES_MONEDA[codigo] ?? codigo;
}

export type TonoMoneda = "primary" | "secondary" | "tertiary" | "warning" | "danger";

// Para distinguir a simple vista las tarjetas de saldo por moneda (billetera
// de USD vs. de PYG vs. de BRL) — cada una con un tono fijo y reconocible en
// vez de todas con el mismo color. Las 3 monedas conocidas tienen un tono
// fijo; cualquier otra (agregada a mano) cicla por los tonos restantes según
// el orden en que aparece, para seguir siendo distinguible sin repetir.
const TONOS_MONEDA: Record<string, TonoMoneda> = {
  USD: "primary",
  PYG: "tertiary",
  BRL: "warning",
};
const CICLO_TONOS: TonoMoneda[] = ["primary", "secondary", "tertiary", "warning", "danger"];

export function tonoMoneda(codigo: string | null | undefined, indice: number): TonoMoneda {
  if (codigo && TONOS_MONEDA[codigo]) return TONOS_MONEDA[codigo];
  return CICLO_TONOS[indice % CICLO_TONOS.length];
}

const CLASE_TEXTO_TONO: Record<TonoMoneda, string> = {
  primary: "text-primary",
  secondary: "text-secondary",
  tertiary: "text-tertiary",
  warning: "text-warning",
  danger: "text-error",
};

// Para componentes que no pasan por `StatCard`/`cva` (ej. `CajaResumenMonedas`,
// que arma sus propias clases a mano) — misma asignación de tono que
// `tonoMoneda`, ya resuelta a la clase de Tailwind.
export function claseIconoMoneda(codigo: string | null | undefined, indice: number): string {
  return CLASE_TEXTO_TONO[tonoMoneda(codigo, indice)];
}

const CLASE_FONDO_TONO: Record<TonoMoneda, string> = {
  primary: "bg-primary/10 text-primary",
  secondary: "bg-secondary/10 text-secondary",
  tertiary: "bg-tertiary/10 text-tertiary",
  warning: "bg-warning/10 text-warning",
  danger: "bg-error/10 text-error",
};

// Fondo + ícono, para el círculo de la tarjeta de cuenta (`IconoCuenta` en
// caja-panel.tsx) — a diferencia de `claseIconoMoneda` (solo texto), acá el
// fondo también lleva el tono para que el círculo entero se distinga, no
// solo el ícono.
export function claseFondoIconoMoneda(codigo: string | null | undefined, indice: number): string {
  return CLASE_FONDO_TONO[tonoMoneda(codigo, indice)];
}

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
