"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  actualizarPerfilSchema,
  type ActualizarPerfilInput,
} from "@repo/domain/schemas";
import { actualizarPerfil } from "@/actions/auth/actualizar-perfil";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

export function EditarPerfilForm({ nombreActual }: { nombreActual: string | null }) {
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ActualizarPerfilInput>({
    resolver: zodResolver(actualizarPerfilSchema),
    defaultValues: { nombre: nombreActual ?? "" },
  });

  async function onSubmit(data: ActualizarPerfilInput) {
    setServerMessage(null);
    const result = await actualizarPerfil(data);
    setServerMessage(
      result.ok ? "Datos actualizados." : result.error.message
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex w-full max-w-sm flex-col gap-3"
      noValidate
    >
      <FormField htmlFor="nombre" label="Nombre" error={errors.nombre?.message}>
        <Input id="nombre" type="text" className="w-full" {...register("nombre")} />
      </FormField>
      <Button type="submit" disabled={isSubmitting}>
        Guardar cambios
      </Button>
      {serverMessage && (
        <p role="status" className="text-sm">
          {serverMessage}
        </p>
      )}
    </form>
  );
}
