"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signInSchema, type SignInInput } from "@repo/domain/schemas";
import { signIn } from "@/actions/auth/sign-in";

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
        <div>
          <label htmlFor="email" className="block text-sm">
            Email
          </label>
          <input
            id="email"
            type="email"
            className="w-full rounded border px-3 py-2"
            {...register("email")}
          />
          {errors.email && (
            <p role="alert" className="text-sm text-red-600">
              {errors.email.message}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="password" className="block text-sm">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            className="w-full rounded border px-3 py-2"
            {...register("password")}
          />
          {errors.password && (
            <p role="alert" className="text-sm text-red-600">
              {errors.password.message}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-50"
        >
          Iniciar sesión
        </button>
        {serverMessage && (
          <p role="alert" className="text-sm text-red-600">
            {serverMessage}
          </p>
        )}
      </form>
      <a href="/registro" className="text-sm underline">
        Crear cuenta
      </a>
    </main>
  );
}
