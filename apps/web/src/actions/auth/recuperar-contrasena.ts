"use server";

import { headers } from "next/headers";
import { recuperarContrasenaSchema } from "@repo/domain/schemas";
import { createClient } from "@/lib/supabase/server";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// Supabase no distingue "el email no existe" de "listo, revisá tu correo" en
// la respuesta de `resetPasswordForEmail` — evita enumeración de cuentas, así
// que este action siempre resuelve `ok: true` si el email tiene formato
// válido, exista o no la cuenta detrás.
export const recuperarContrasena = withErrorHandling(async (input: unknown): Promise<void> => {
  const parsed = recuperarContrasenaSchema.parse(input);
  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";

  await supabase.auth.resetPasswordForEmail(parsed.email, {
    redirectTo: `${origin}/restablecer-contrasena`,
  });
});
