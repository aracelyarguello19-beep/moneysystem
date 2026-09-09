-- Logo por negocio (mostrado en el switcher y en Mis negocios) y foto de
-- perfil por cuenta — ambos opcionales, guardan la URL pública del bucket
-- de Supabase Storage "productos" (reutilizado, ver imagen-upload.tsx).
ALTER TABLE "negocios" ADD COLUMN "logo_url" TEXT;
ALTER TABLE "cuentas" ADD COLUMN "avatar_url" TEXT;
