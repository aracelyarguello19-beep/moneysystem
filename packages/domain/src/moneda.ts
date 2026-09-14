// El ámbito Personal reutiliza esta misma entidad con negocioId = null en
// vez de duplicar modelos. [Source: architecture/data-models.md#Moneda]
export interface Moneda {
  id: string;
  cuentaId: string;
  negocioId: string | null;
  ambito: "LABORAL" | "PERSONAL";
  codigo: string;
  nombre: string;
  esBase: boolean;
  activa: boolean;
}

export class MonedaInvalidaError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "MonedaInvalidaError";
  }
}

// Comprar moneda extranjera (Caja): la cuenta que paga tiene que ser de la
// moneda oficial — no tiene sentido "comprar Gs con Gs" ni pagar una
// compra de USD con un efectivo que ya es BRL sin pasar por Gs.
export function assertMonedaEsBase(m: Pick<Moneda, "esBase" | "codigo">): void {
  if (!m.esBase) {
    throw new MonedaInvalidaError(`La cuenta de origen debe ser de la moneda oficial (es ${m.codigo}).`);
  }
}

// Comprar moneda extranjera (Caja): la cuenta que recibe tiene que ser
// justamente eso, una moneda distinta a la oficial.
export function assertMonedaNoEsBase(m: Pick<Moneda, "esBase" | "codigo">): void {
  if (m.esBase) {
    throw new MonedaInvalidaError("La cuenta de destino debe ser de una moneda distinta a la oficial.");
  }
}

// Transferencia entre cuentas propias (Caja): nunca convierte — mover
// plata entre monedas distintas es una compra de moneda, no una
// transferencia (ver assertMonedaEsBase/NoEsBase, comprarMonedaSchema).
export function assertMismaMoneda(a: Pick<Moneda, "id">, b: Pick<Moneda, "id">): void {
  if (a.id !== b.id) {
    throw new MonedaInvalidaError("Solo se puede transferir entre cuentas de la misma moneda.");
  }
}
