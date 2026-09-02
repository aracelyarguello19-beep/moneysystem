-- Permite que una persona elimine su propia cuenta. `app_user` (NOBYPASSRLS)
-- no tiene acceso al schema `auth`, así que borrar `auth.users` requiere una
-- función SECURITY DEFINER — mismo patrón que `ensure_cuenta()`
-- (migración 20260901023000). El borrado de `auth.users` cascadea a
-- `public.cuentas` (FK `cuentas_id_fkey ... ON DELETE CASCADE`, migración
-- 20260901021212_init_cuentas) y de ahí a todo el resto de las tablas de la
-- cuenta (negocios, ventas, gastos, etc.), todas con `onDelete: Cascade`
-- hacia `cuentaId`.
CREATE FUNCTION public.eliminar_cuenta_propia()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'eliminar_cuenta_propia: no hay sesión autenticada';
  END IF;

  DELETE FROM auth.users WHERE id = v_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.eliminar_cuenta_propia() TO app_user;
