-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "cuentas" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cuentas_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey: id == auth.users.id (Supabase Auth), 1:1 (Story 1.2)
-- No modelado en Prisma porque auth.users pertenece al schema "auth" de
-- Supabase, no al nuestro. [Source: architecture/database-schema.md]
ALTER TABLE "cuentas" ADD CONSTRAINT "cuentas_id_fkey"
    FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

-- RowLevelSecurity: cada cuenta solo es visible/editable por su propio dueño
-- (FR1, NFR1). [Source: architecture/database-schema.md]
ALTER TABLE "cuentas" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cuentas_isolation" ON "cuentas"
    USING (id = auth.uid());

-- Trigger: crea el registro espejo en cuentas apenas Supabase Auth crea el
-- usuario en auth.users (Story 1.2, AC3: "queda asociada a un único dueño
-- desde el momento del registro"). Se resuelve acá y no en la Server Action
-- de signUp porque, si el proyecto tiene confirmación de email habilitada,
-- signUp() no deja sesión activa todavía y un INSERT a `cuentas` desde la
-- app (rol app_user, sujeto a RLS) fallaría por falta de auth.uid(). La
-- función corre SECURITY DEFINER (dueña: rol owner de la migración), que no
-- está sujeto a RLS. [Source: architecture/database-schema.md]
CREATE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.cuentas (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
