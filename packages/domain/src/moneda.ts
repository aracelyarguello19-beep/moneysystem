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
