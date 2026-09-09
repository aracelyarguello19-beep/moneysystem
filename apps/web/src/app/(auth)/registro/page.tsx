"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registroFormSchema, type RegistroFormInput } from "@repo/domain/schemas";
import { signUp } from "@/actions/auth/sign-up";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

const REDIRECCION_MS = 1800;

export default function RegistroPage() {
  const router = useRouter();
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegistroFormInput>({ resolver: zodResolver(registroFormSchema) });

  async function onSubmit(data: RegistroFormInput) {
    setServerMessage(null);
    const result = await signUp({
      nombre: data.nombre,
      email: data.email,
      password: data.password,
    });
    if (!result.ok) {
      setServerMessage(result.error.message);
      return;
    }
    setServerMessage(
      "Cuenta creada. Si tu proyecto requiere confirmación de email, revisá tu bandeja de entrada antes de iniciar sesión. Redirigiendo…"
    );
    setTimeout(() => router.push("/login"), REDIRECCION_MS);
  }

  const tipoPassword = mostrarPassword ? "text" : "password";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 sm:p-8">
      <h1 className="text-xl font-semibold">Crear cuenta</h1>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex w-full max-w-sm flex-col gap-3"
        noValidate
      >
        <FormField htmlFor="nombre" label="Nombre" error={errors.nombre?.message}>
          <Input id="nombre" type="text" className="w-full" {...register("nombre")} />
        </FormField>
        <FormField htmlFor="email" label="Email" error={errors.email?.message}>
          <Input id="email" type="email" className="w-full" {...register("email")} />
        </FormField>
        <FormField htmlFor="password" label="Contraseña" error={errors.password?.message}>
          <Input id="password" type={tipoPassword} className="w-full" {...register("password")} />
        </FormField>
        <FormField
          htmlFor="confirmar-password"
          label="Confirmar contraseña"
          error={errors.confirmarPassword?.message}
        >
          <Input
            id="confirmar-password"
            type={tipoPassword}
            className="w-full"
            {...register("confirmarPassword")}
          />
        </FormField>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={mostrarPassword}
            onChange={(e) => setMostrarPassword(e.target.checked)}
          />
          Mostrar contraseña
        </label>
        <Button type="submit" disabled={isSubmitting}>
          Crear cuenta
        </Button>
        {serverMessage && (
          <p role="status" className="text-sm">
            {serverMessage}
          </p>
        )}
      </form>
      <Button asChild variant="link">
        <a href="/login">Ya tengo cuenta</a>
      </Button>
    </main>
  );
}
