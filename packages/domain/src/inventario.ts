// No hay guidance específica en architecture/data-models.md para un tipo
// `ValorInventario` explícito — se deriva de `Item.stockActual * Item.costoCompra`.
// Type Sharing: el tipo de retorno vive acá; el cálculo con `Prisma.Decimal`
// vive en `packages/database` (permitido por Coding Standards).
// [Source: architecture/data-models.md#Item, architecture/coding-standards.md]
export interface ValorInventarioItem {
  itemId: string;
  nombre: string;
  stockActual: string;
  costoCompra: string;
  valor: string;
}

export interface ValorInventario {
  items: ValorInventarioItem[];
  total: string;
}
