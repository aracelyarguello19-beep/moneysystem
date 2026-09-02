// Define qué muestra el dashboard del negocio (Indicadores) y qué secciones
// del menú lateral tienen sentido para él — un negocio de Servicios nunca
// vendió mercadería, así que el CMV (Costo de Mercadería Vendida) no debería
// figurar ahí; simétrico para CSV en uno de Productos. MIXTO muestra todo.
export type TipoNegocio = "PRODUCTOS" | "SERVICIOS" | "MIXTO";

// [Source: architecture/data-models.md#Negocio]
export interface Negocio {
  id: string;
  cuentaId: string;
  nombre: string;
  tipo: TipoNegocio;
  estado: "ACTIVO" | "ARCHIVADO";
  createdAt: Date;
  archivedAt: Date | null;
}

export class NegocioArchivadoError extends Error {
  constructor() {
    super("El negocio está archivado y no acepta nuevas transacciones.");
    this.name = "NegocioArchivadoError";
  }
}

// Guardia reutilizable para toda Server Action de escritura del módulo
// Laboral (Story 1.4, Task 2): antes de mutar, resolver el negocio bajo
// `withRlsContext` y llamar a esta función con su `estado`. Es una función
// pura (no toca la DB) para poder testearla sin infraestructura — la
// resolución del negocio (y el filtrado por RLS/pertenencia a la cuenta) es
// responsabilidad de quien la invoca, no de esta guardia.
// [Source: architecture/coding-standards.md#Critical Fullstack Rules]
export function assertNegocioActivo(estado: Negocio["estado"]): void {
  if (estado !== "ACTIVO") {
    throw new NegocioArchivadoError();
  }
}
