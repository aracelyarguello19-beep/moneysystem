"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { crearNegocioSchema, type CrearNegocioInput } from "@repo/domain/schemas";
import { crearNegocio } from "@/actions/negocios/crear-negocio";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

// El sistema es exclusivo de productos (sin sesión de Servicios) — ya no se
// pregunta a qué se dedica el negocio, siempre queda tipo "MIXTO" (mismo
// default que el onboarding del primer negocio).
export function CrearNegocioForm() {
  const router = useRouter();
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CrearNegocioInput>({
    resolver: zodResolver(crearNegocioSchema),
    defaultValues: { tipo: "MIXTO" },
  });

  async function onSubmit(data: CrearNegocioInput) {
    setServerMessage(null);
    const result = await crearNegocio(data);
    if (!result.ok) {
      setServerMessage(result.error.message);
      return;
    }
    reset({ nombre: "", tipo: "MIXTO" });
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex items-end gap-2"
      noValidate
    >
      <FormField htmlFor="nombre" label="Nombre del negocio" error={errors.nombre?.message}>
        <Input id="nombre" type="text" {...register("nombre")} />
      </FormField>
      <Button type="submit" disabled={isSubmitting}>
        Crear negocio
      </Button>
      {serverMessage && (
        <p role="alert" className="text-sm text-danger">
          {serverMessage}
        </p>
      )}
    </form>
  );
}
