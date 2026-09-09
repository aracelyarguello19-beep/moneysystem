"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import dynamic from "next/dynamic";
import {
  actualizarPerfilSchema,
  type ActualizarPerfilInput,
} from "@repo/domain/schemas";
import { actualizarPerfil } from "@/actions/auth/actualizar-perfil";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

// Carga diferida: mismo criterio que en `CrearNegocioForm` — el cliente de
// Supabase Storage no debería viajar en el bundle inicial de /perfil.
const ImagenUpload = dynamic(
  () => import("@/components/imagen-upload").then((m) => m.ImagenUpload),
  { ssr: false }
);

export function EditarPerfilForm({
  nombreActual,
  avatarUrlActual,
}: {
  nombreActual: string | null;
  avatarUrlActual: string | null;
}) {
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ActualizarPerfilInput>({
    resolver: zodResolver(actualizarPerfilSchema),
    defaultValues: { nombre: nombreActual ?? "", avatarUrl: avatarUrlActual },
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
      <Controller
        control={control}
        name="avatarUrl"
        render={({ field }) => (
          <ImagenUpload
            value={field.value ?? null}
            onChange={field.onChange}
            folder="avatar"
            label="Foto de perfil"
            redondo
          />
        )}
      />
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
