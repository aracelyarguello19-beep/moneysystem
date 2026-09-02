"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { monedaCamposSchema, type MonedaCamposInput } from "@repo/domain/schemas";
import type { Moneda } from "@repo/domain";
import { crearMoneda } from "@/actions/catalogos/crear-moneda";
import { listarMonedas } from "@/actions/catalogos/listar-monedas";
import { desactivarMoneda } from "@/actions/catalogos/desactivar-moneda";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

// Catálogo de monedas del negocio activo — `negocioId` lo resuelve la
// página contenedora a partir del contexto (selector de negocio activo),
// nunca el usuario en el formulario.
// [Source: architecture/frontend-architecture.md#Component Organization]
export function MonedaCatalogo({ negocioId }: { negocioId: string }) {
  const [monedas, setMonedas] = useState<Moneda[] | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const result = await listarMonedas(negocioId);
    if (result.ok) setMonedas(result.data);
  }, [negocioId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MonedaCamposInput>({ resolver: zodResolver(monedaCamposSchema) });

  async function onSubmit(data: MonedaCamposInput) {
    setServerMessage(null);
    const result = await crearMoneda({ negocioId, ...data });
    if (!result.ok) {
      setServerMessage(result.error.message);
      return;
    }
    reset();
    await cargar();
  }

  async function onDesactivar(monedaId: string) {
    setServerMessage(null);
    const result = await desactivarMoneda(monedaId, negocioId);
    if (!result.ok) {
      setServerMessage(result.error.message);
      return;
    }
    await cargar();
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit(onSubmit)} className="flex items-end gap-2" noValidate>
        <FormField htmlFor="codigo" label="Código" error={errors.codigo?.message}>
          <Input id="codigo" className="w-24" {...register("codigo")} />
        </FormField>
        <FormField htmlFor="nombre-moneda" label="Nombre" error={errors.nombre?.message}>
          <Input id="nombre-moneda" {...register("nombre")} />
        </FormField>
        <Button type="submit" disabled={isSubmitting}>
          Agregar moneda
        </Button>
      </form>

      {serverMessage && (
        <p role="alert" className="text-sm text-danger">
          {serverMessage}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {monedas?.map((m) => (
          <li key={m.id} className="flex items-center justify-between rounded border border-default px-4 py-2">
            <div>
              <p className="font-medium">
                {m.codigo} — {m.nombre}
                {m.esBase && " (base)"}
              </p>
              <p className="text-xs text-muted">{m.activa ? "Activa" : "Desactivada"}</p>
            </div>
            {m.activa && !m.esBase && (
              <Button type="button" variant="link" className="text-danger" onClick={() => onDesactivar(m.id)}>
                Desactivar
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
