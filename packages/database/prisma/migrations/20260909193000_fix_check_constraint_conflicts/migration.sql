-- ============================================================================
-- Corrige 2 FKs de la migración anterior (20260909190000) que usaban
-- SET NULL pero chocan con checks existentes
-- ============================================================================
--
-- `venta_items.item_id -> items.id`: anularlo viola
-- `chk_venta_item_producto_libre` (item_id IS NOT NULL OR es venta libre con
-- nombre_libre) en cualquier línea de catálogo normal (es_libre = false).
--
-- `compras.cuenta_financiera_id -> cuentas_financieras.id`: anularlo viola
-- `chk_compra_medio_pago` (cuenta_financiera_id NOT NULL salvo
-- forma_pago = 'CREDITO_PROVEEDOR') en cualquier compra que no fue a crédito.
--
-- Ambas pasan a CASCADE: la fila de todos modos se borra junto con el
-- negocio (venta_items vía su propio venta_id CASCADE, compras vía su propio
-- negocio_id CASCADE) — no hay necesidad de preservarla anulada.
-- ============================================================================

ALTER TABLE "venta_items" DROP CONSTRAINT "venta_items_item_id_fkey";
ALTER TABLE "venta_items" ADD CONSTRAINT "venta_items_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE;

ALTER TABLE "compras" DROP CONSTRAINT "compras_cuenta_financiera_id_fkey";
ALTER TABLE "compras" ADD CONSTRAINT "compras_cuenta_financiera_id_fkey"
    FOREIGN KEY ("cuenta_financiera_id") REFERENCES "cuentas_financieras"("id") ON DELETE CASCADE;
