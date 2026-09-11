"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  cambiarContrasenaSchema,
  type CambiarContrasenaInput,
} from "@repo/domain/schemas";
import { cambiarContrasena } from "@/actions/auth/cambiar-contrasena";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

export function CambiarContrasenaForm() {
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CambiarContrasenaInput>({ resolver: zodResolver(cambiarContrasenaSchema) });

  async function onSubmit(data: CambiarContrasenaInput) {
    setServerMessage(null);
    const result = await cambiarContrasena(data);
    if (!result.ok) {
      setServerMessage(result.error.message);
      return;
    }
    setServerMessage("Contraseña actualizada.");
    reset();
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-label-lg font-semibold text-on-surface">Cambiar contraseña</h2>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex w-full max-w-sm flex-col gap-3"
        noValidate
      >
        <FormField
          htmlFor="password-actual"
          label="Contraseña actual"
          error={errors.passwordActual?.message}
        >
          <Input
            id="password-actual"
            type="password"
            className="w-full"
            {...register("passwordActual")}
          />
        </FormField>
        <FormField htmlFor="password-nueva" label="Nueva contraseña" error={errors.password?.message}>
          <Input id="password-nueva" type="password" className="w-full" {...register("password")} />
        </FormField>
        <FormField
          htmlFor="confirmar-password-nueva"
          label="Confirmar nueva contraseña"
          error={errors.confirmarPassword?.message}
        >
          <Input
            id="confirmar-password-nueva"
            type="password"
            className="w-full"
            {...register("confirmarPassword")}
          />
        </FormField>
        <Button type="submit" disabled={isSubmitting} className="w-fit">
          Cambiar contraseña
        </Button>
        {serverMessage && (
          <p role="status" className="text-sm">
            {serverMessage}
          </p>
        )}
      </form>
    </div>
  );
}
