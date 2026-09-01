"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signUpSchema, type SignUpInput } from "@repo/domain/schemas";
import { signUp } from "@/actions/auth/sign-up";

export default function RegistroPage() {
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput>({ resolver: zodResolver(signUpSchema) });

  async function onSubmit(data: SignUpInput) {
    setServerMessage(null);
    const result = await signUp(data);
    if (!result.ok) {
      setServerMessage(result.error.message);
      return;
    }
    setServerMessage(
      "Cuenta creada. Si tu proyecto requiere confirmación de email, revisá tu bandeja de entrada antes de iniciar sesión."
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-xl font-semibold">Crear cuenta</h1>
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
          Crear cuenta
        </button>
        {serverMessage && (
          <p role="status" className="text-sm">
            {serverMessage}
          </p>
        )}
      </form>
      <a href="/login" className="text-sm underline">
        Ya tengo cuenta
      </a>
    </main>
  );
}
