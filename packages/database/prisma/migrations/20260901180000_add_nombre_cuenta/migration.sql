-- Agrega el nombre de la persona a `cuentas`. Nullable a nivel de columna
-- para no romper las filas ya existentes (creadas antes de este campo);
-- la obligatoriedad se aplica en la capa de aplicación (signUpSchema) para
-- todo registro nuevo.
ALTER TABLE public.cuentas ADD COLUMN nombre text;

-- ensure_cuenta() ahora también copia el nombre desde el metadata que
-- signUp() guarda en auth.users.raw_user_meta_data (clave "nombre").
-- [Source: architecture/database-schema.md, Story 1.2 AC3]
CREATE OR REPLACE FUNCTION public.ensure_cuenta()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_nombre text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ensure_cuenta: no hay sesión autenticada';
  END IF;

  SELECT email, raw_user_meta_data ->> 'nombre'
    INTO v_email, v_nombre
    FROM auth.users
    WHERE id = v_uid;

  INSERT INTO public.cuentas (id, email, nombre)
  VALUES (v_uid, v_email, v_nombre)
  ON CONFLICT (id) DO NOTHING;
END;
$$;
