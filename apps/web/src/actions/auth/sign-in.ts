"use server";

import { redirect } from "next/navigation";
import type { Result } from "@repo/domain";
import { signInSchema } from "@repo/domain/schemas";
import { withRlsContext } from "@repo/database";
import { createClient } from "@/lib/supabase/server";

// No usa `withErrorHandling`: el AC4 exige un código/mensaje específico
// (`UNAUTHENTICATED`, genérico, sin distinguir "no existe" de "contraseña
// incorrecta") — el wrapper genérico devolvería `DATABASE_ERROR` con un
// mensaje distinto, no el que pide esta story.
// [Source: architecture/error-handling-strategy.md#Error Response Format]
export async function signIn(input: unknown): Promise<Result<never>> {
  const requestId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: parsed.error.issues[0]?.message ?? "Datos inválidos.",
        requestId,
        timestamp,
      },
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return {
      ok: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "Credenciales inválidas.",
        requestId,
        timestamp,
      },
    };
  }

  // Red de seguridad para AC3: garantiza el registro espejo en `cuentas` en
  // cada login exitoso (idempotente), cubriendo el caso de proyectos con
  // confirmación de email obligatoria (sin sesión hasta este momento).
  await withRlsContext(data.user.id, null, async (tx) => {
    await tx.$executeRawUnsafe("select public.ensure_cuenta()");
  });

  // El destino post-login es el dashboard (Indicadores); AppLayout
  // (app/(app)/layout.tsx) redirige a /onboarding si la cuenta todavía no
  // tiene ningún negocio, así que no hace falta distinguir ese caso acá.
  redirect("/laboral/indicadores");
}
