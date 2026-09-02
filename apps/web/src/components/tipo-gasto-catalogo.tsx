"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  tipoGastoCamposLaboralSchema,
  type TipoGastoCamposLaboralInput,
} from "@repo/domain/schemas";
import type { TipoGasto } from "@repo/domain";
import { crearTipoGasto } from "@/actions/catalogos/crear-tipo-gasto";
import { listarTiposGasto } from "@/actions/catalogos/listar-tipos-gasto";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const OPCIONES_CLASIFICACION = ["OPERATIVO", "FINANCIERO"] as const;

// La clasificación disponible se restringe a las Laboral (AC1) — el
// formulario nunca ofrece una clasificación que no corresponda, y el submit
// queda deshabilitado hasta elegir una (AC3, Task 2).
// [Source: architecture/frontend-architecture.md#Component Organization]
export function TipoGastoCatalogo({ negocioId }: { negocioId: string }) {
  const [tiposGasto, setTiposGasto] = useState<TipoGasto[] | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const result = await listarTiposGasto(negocioId);
    if (result.ok) setTiposGasto(result.data);
  }, [negocioId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isValid },
  } = useForm<TipoGastoCamposLaboralInput>({
    resolver: zodResolver(tipoGastoCamposLaboralSchema),
    mode: "onChange",
  });

  async function onSubmit(data: TipoGastoCamposLaboralInput) {
    setServerMessage(null);
    const result = await crearTipoGasto({ negocioId, ...data });
    if (!result.ok) {
      setServerMessage(result.error.message);
      return;
    }
    reset();
    await cargar();
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit(onSubmit)} className="flex items-end gap-2" noValidate>
        <FormField htmlFor="nombre-tipo-gasto" label="Nombre" error={errors.nombre?.message}>
          <Input id="nombre-tipo-gasto" {...register("nombre")} />
        </FormField>
        <FormField htmlFor="clasificacion" label="Clasificación" error={errors.clasificacion?.message}>
          <Select id="clasificacion" defaultValue="" {...register("clasificacion")}>
            <option value="" disabled>
              Elegí una clasificación
            </option>
            {OPCIONES_CLASIFICACION.map((opcion) => (
              <option key={opcion} value={opcion}>
                {opcion}
              </option>
            ))}
          </Select>
        </FormField>
        <Button type="submit" disabled={isSubmitting || !isValid}>
          Agregar tipo de gasto
        </Button>
      </form>

      {serverMessage && (
        <p role="alert" className="text-sm text-danger">
          {serverMessage}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {tiposGasto?.map((t) => (
          <li key={t.id} className="flex items-center justify-between rounded border border-default px-4 py-2">
            <p className="font-medium">{t.nombre}</p>
            <p className="text-xs text-muted">{t.clasificacion}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
