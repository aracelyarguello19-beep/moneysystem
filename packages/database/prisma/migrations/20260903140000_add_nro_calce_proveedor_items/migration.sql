-- Sesión "Productos" (Compras + Inventario): el número de calce identifica
-- la variante del producto (dos calces del mismo modelo son ítems
-- distintos, cada uno con su propio stock/costo) y el proveedor habitual es
-- metadata de catálogo — ambos opcionales, ninguno reemplaza al `proveedor`
-- puntual de cada fila de `compras`.
ALTER TABLE "items" ADD COLUMN "nro_calce" TEXT;
ALTER TABLE "items" ADD COLUMN "proveedor" TEXT;
