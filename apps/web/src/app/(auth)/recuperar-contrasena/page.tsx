"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  recuperarContrasenaSchema,
  type RecuperarContrasenaInput,
} from "@repo/domain/schemas";
import { recuperarContrasena } from "@/actions/auth/recuperar-contrasena";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

export default function RecuperarContrasenaPage() {
  const [enviado, setEnviado] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RecuperarContrasenaInput>({ resolver: zodResolver(recuperarContrasenaSchema) });

  async function onSubmit(data: RecuperarContrasenaInput) {
    await recuperarContrasena(data);
    // Mensaje siempre igual, exista o no la cuenta: evita revelar qué
    // emails están registrados (ver comentario en el action).
    setEnviado(true);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 sm:p-8">
      <h1 className="text-xl font-semibold">Recuperar contraseña</h1>
      {enviado ? (
        <p role="status" className="max-w-sm text-center text-sm text-ink">
          Si el email está registrado, te enviamos un enlace para restablecer tu contraseña. Revisá tu
          bandeja de entrada (y spam).
        </p>
      ) : (
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex w-full max-w-sm flex-col gap-3"
          noValidate
        >
          <FormField htmlFor="email" label="Email" error={errors.email?.message}>
            <Input id="email" type="email" className="w-full" {...register("email")} />
          </FormField>
          <Button type="submit" disabled={isSubmitting}>
            Enviar enlace de recuperación
          </Button>
        </form>
      )}
      <Button asChild variant="link">
        <a href="/login">Volver a iniciar sesión</a>
      </Button>
    </main>
  );
}
