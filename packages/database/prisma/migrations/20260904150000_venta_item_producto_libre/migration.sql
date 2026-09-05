-- Venta Libre con producto fuera de catálogo: `item_id` pasa a ser opcional
-- y se agrega `nombre_libre` para identificar la línea cuando no hay un
-- Item real detrás (nunca se crea un Item nuevo automáticamente para esto).
ALTER TABLE "venta_items" ALTER COLUMN "item_id" DROP NOT NULL;
ALTER TABLE "venta_items" ADD COLUMN "nombre_libre" TEXT;

-- Toda línea debe poder identificarse: o tiene item_id (producto real del
-- catálogo), o es una línea "venta libre" con nombre_libre cargado.
ALTER TABLE "venta_items" ADD CONSTRAINT "chk_venta_item_producto_libre" CHECK (
  item_id IS NOT NULL OR (es_libre AND nombre_libre IS NOT NULL)
);
