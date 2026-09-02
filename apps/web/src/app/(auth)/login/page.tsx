"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signInSchema, type SignInInput } from "@repo/domain/schemas";
import { signIn } from "@/actions/auth/sign-in";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput>({ resolver: zodResolver(signInSchema) });

  async function onSubmit(data: SignInInput) {
    setServerMessage(null);
    const result = await signIn(data);
    // Si signIn tiene éxito, redirige server-side y esta función no vuelve
    // a ejecutar el resto (redirect() de Next.js corta la ejecución).
    if (result && !result.ok) {
      setServerMessage(result.error.message);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-xl font-semibold">Iniciar sesión</h1>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex w-full max-w-sm flex-col gap-3"
        noValidate
      >
        <FormField htmlFor="email" label="Email" error={errors.email?.message}>
          <Input id="email" type="email" className="w-full" {...register("email")} />
        </FormField>
        <FormField htmlFor="password" label="Contraseña" error={errors.password?.message}>
          <Input id="password" type="password" className="w-full" {...register("password")} />
        </FormField>
        <Button type="submit" disabled={isSubmitting}>
          Iniciar sesión
        </Button>
        {serverMessage && (
          <p role="alert" className="text-sm text-danger">
            {serverMessage}
          </p>
        )}
      </form>
      <Button asChild variant="link">
        <a href="/registro">Crear cuenta</a>
      </Button>
    </main>
  );
}
