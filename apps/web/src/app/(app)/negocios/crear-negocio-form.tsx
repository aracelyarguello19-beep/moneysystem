"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { crearNegocioSchema, type CrearNegocioInput } from "@repo/domain/schemas";
import { crearNegocio } from "@/actions/negocios/crear-negocio";

// Un único campo requerido (nombre) para cumplir el objetivo de <2 minutos
// para dar de alta un negocio (AC5, NFR11).
export function CrearNegocioForm() {
  const router = useRouter();
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CrearNegocioInput>({ resolver: zodResolver(crearNegocioSchema) });

  async function onSubmit(data: CrearNegocioInput) {
    setServerMessage(null);
    const result = await crearNegocio(data);
    if (!result.ok) {
      setServerMessage(result.error.message);
      return;
    }
    reset();
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex items-end gap-2"
      noValidate
    >
      <div>
        <label htmlFor="nombre" className="block text-sm">
          Nombre del negocio
        </label>
        <input
          id="nombre"
          type="text"
          className="rounded border px-3 py-2"
          {...register("nombre")}
        />
        {errors.nombre && (
          <p role="alert" className="text-sm text-red-600">
            {errors.nombre.message}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-50"
      >
        Crear negocio
      </button>
      {serverMessage && (
        <p role="alert" className="text-sm text-red-600">
          {serverMessage}
        </p>
      )}
    </form>
  );
}
