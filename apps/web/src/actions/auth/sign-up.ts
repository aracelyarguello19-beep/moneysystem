"use server";

import { signUpSchema } from "@repo/domain/schemas";
import { withRlsContext } from "@repo/database";
import { createClient } from "@/lib/supabase/server";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// El registro espejo en `cuentas` se asegura llamando a la función SQL
// `ensure_cuenta()` (idempotente) — ver migración
// 20260901023000_ensure_cuenta_function. Solo se puede llamar acá si
// signUp() ya dejó una sesión activa (proyecto sin confirmación de email
// obligatoria); si no, se asegura en el primer signIn exitoso (ver
// sign-in.ts) — cubre igual el AC3 ("desde el momento del registro" o,
// como máximo, desde el primer login si el email requiere confirmación).
export const signUp = withErrorHandling(async (input: unknown) => {
  const parsed = signUpSchema.parse(input);
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email: parsed.email,
    password: parsed.password,
  });

  if (error) throw error;

  if (data.session && data.user) {
    await withRlsContext(data.user.id, null, async (tx) => {
      await tx.$executeRawUnsafe("select public.ensure_cuenta()");
    });
  }

  return { email: parsed.email };
});
