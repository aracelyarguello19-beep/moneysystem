"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  restablecerContrasenaSchema,
  type RestablecerContrasenaInput,
} from "@repo/domain/schemas";
import { restablecerContrasena } from "@/actions/auth/restablecer-contrasena";
import { createClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

const REDIRECCION_MS = 1800;

type Estado = "cargando" | "listo" | "invalido";

export default function RestablecerContrasenaPage() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>("cargando");
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RestablecerContrasenaInput>({ resolver: zodResolver(restablecerContrasenaSchema) });

  // El enlace del email trae los tokens de recuperación en el fragmento de
  // la URL (`#access_token=...&type=recovery`), que el servidor nunca ve —
  // el cliente de Supabase los detecta recién al inicializarse en el
  // navegador (`detectSessionInUrl`, default) y dispara `PASSWORD_RECOVERY`.
  // Si a los pocos segundos no hay sesión, el enlace venció o ya se usó.
  useEffect(() => {
    const supabase = createClient();
    let resuelto = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!resuelto && session) {
        resuelto = true;
        setEstado("listo");
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!resuelto && data.session) {
        resuelto = true;
        setEstado("listo");
      }
    });

    const timeout = setTimeout(() => {
      if (!resuelto) {
        resuelto = true;
        setEstado("invalido");
      }
    }, 4000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function onSubmit(data: RestablecerContrasenaInput) {
    setServerMessage(null);
    const result = await restablecerContrasena(data);
    if (!result.ok) {
      setServerMessage(result.error.message);
      return;
    }
    await createClient().auth.signOut();
    setServerMessage("Contraseña actualizada. Iniciá sesión con tu nueva contraseña. Redirigiendo…");
    setTimeout(() => router.push("/login"), REDIRECCION_MS);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 sm:p-8">
      <h1 className="text-xl font-semibold">Restablecer contraseña</h1>

      {estado === "cargando" && (
        <p className="text-sm text-muted">Validando enlace…</p>
      )}

      {estado === "invalido" && (
        <>
          <p role="alert" className="max-w-sm text-center text-sm text-danger">
            El enlace venció o ya se usó. Pedí uno nuevo.
          </p>
          <Button asChild variant="link">
            <a href="/recuperar-contrasena">Pedir un nuevo enlace</a>
          </Button>
        </>
      )}

      {estado === "listo" && (
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex w-full max-w-sm flex-col gap-3"
          noValidate
        >
          <FormField htmlFor="password" label="Nueva contraseña" error={errors.password?.message}>
            <Input id="password" type="password" className="w-full" {...register("password")} />
          </FormField>
          <FormField
            htmlFor="confirmar-password"
            label="Confirmar nueva contraseña"
            error={errors.confirmarPassword?.message}
          >
            <Input
              id="confirmar-password"
              type="password"
              className="w-full"
              {...register("confirmarPassword")}
            />
          </FormField>
          <Button type="submit" disabled={isSubmitting}>
            Guardar nueva contraseña
          </Button>
          {serverMessage && (
            <p role="status" className="text-sm">
              {serverMessage}
            </p>
          )}
        </form>
      )}
    </main>
  );
}
