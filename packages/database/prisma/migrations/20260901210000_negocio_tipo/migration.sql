-- Define a qué se dedica el negocio (Productos, Servicios o Mixto) — el
-- dashboard de Indicadores usa esto para no mostrar CMV en un negocio que
-- solo vende servicios, ni CSV en uno que solo vende productos. Default
-- 'MIXTO' para negocios existentes (creados antes de esta columna), que
-- siguen viendo el dashboard completo sin cambios.
ALTER TABLE "negocios" ADD COLUMN "tipo" TEXT NOT NULL DEFAULT 'MIXTO';
