-- Reemplaza el trigger `on_auth_user_created` de la migración anterior.
-- Verificado con una señal real (signUp de prueba contra Supabase Auth real):
-- el trigger estaba correctamente instalado, habilitado, con el owner y los
-- permisos esperados (postgres, BYPASSRLS) pero el registro espejo en
-- `cuentas` nunca se creó — no se pudo determinar la causa exacta sin acceso
-- a los logs internos de Supabase. Se reemplaza por una función que la propia
-- app invoca explícitamente después de signUp/signIn, controlada y
-- verificable con las mismas herramientas que el resto del sistema.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Idempotente (ON CONFLICT DO NOTHING): la app la llama tanto después de un
-- signUp con sesión inmediata como después de cada signIn exitoso, para
-- cubrir el caso en que el proyecto tenga confirmación de email habilitada
-- (sin sesión hasta el primer login). SECURITY DEFINER (dueño: postgres,
-- BYPASSRLS) porque necesita leer auth.users, a la que `app_user` no tiene
-- acceso. [Source: architecture/database-schema.md, Story 1.2 AC3]
CREATE FUNCTION public.ensure_cuenta()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ensure_cuenta: no hay sesión autenticada';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  INSERT INTO public.cuentas (id, email)
  VALUES (v_uid, v_email)
  ON CONFLICT (id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_cuenta() TO app_user;
