"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { crearNegocioSchema, type CrearNegocioInput } from "@repo/domain/schemas";
import { crearNegocio } from "@/actions/negocios/crear-negocio";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

// Carga diferida: trae el cliente completo de `@supabase/supabase-js`
// (~110kB) solo para subir el logo — sin esto, ese peso viaja en el bundle
// inicial de /negocios aunque nadie suba una imagen.
const ImagenUpload = dynamic(
  () => import("@/components/imagen-upload").then((m) => m.ImagenUpload),
  { ssr: false }
);

// El sistema es exclusivo de productos (sin sesión de Servicios) — ya no se
// pregunta a qué se dedica el negocio, siempre queda tipo "MIXTO" (mismo
// default que el onboarding del primer negocio).
export function CrearNegocioForm() {
  const router = useRouter();
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CrearNegocioInput>({
    resolver: zodResolver(crearNegocioSchema),
    defaultValues: { tipo: "MIXTO", logoUrl: null },
  });

  async function onSubmit(data: CrearNegocioInput) {
    setServerMessage(null);
    const result = await crearNegocio(data);
    if (!result.ok) {
      setServerMessage(result.error.message);
      return;
    }
    reset({ nombre: "", tipo: "MIXTO", logoUrl: null });
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-2"
      noValidate
    >
      <FormField
        htmlFor="nombre"
        label="Nombre del negocio"
        error={errors.nombre?.message}
        className="sm:max-w-xs sm:flex-1"
      >
        <Input id="nombre" type="text" {...register("nombre")} />
      </FormField>
      <Controller
        control={control}
        name="logoUrl"
        render={({ field }) => (
          <ImagenUpload
            value={field.value ?? null}
            onChange={field.onChange}
            folder="negocios"
            label="Logo del negocio"
          />
        )}
      />
      <Button type="submit" disabled={isSubmitting} className="sm:shrink-0">
        Crear negocio
      </Button>
      {serverMessage && (
        <p role="alert" className="text-sm text-danger sm:w-full">
          {serverMessage}
        </p>
      )}
    </form>
  );
}
