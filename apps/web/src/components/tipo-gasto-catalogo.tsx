"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  tipoGastoCamposLaboralSchema,
  tipoGastoCamposPersonalSchema,
  type TipoGastoCamposLaboralInput,
  type TipoGastoCamposPersonalInput,
} from "@repo/domain/schemas";
import type { TipoGasto } from "@repo/domain";
import { crearTipoGasto } from "@/actions/catalogos/crear-tipo-gasto";
import { listarTiposGasto } from "@/actions/catalogos/listar-tipos-gasto";

const OPCIONES_CLASIFICACION = {
  LABORAL: ["OPERATIVO", "FINANCIERO"],
  PERSONAL: ["FIJO", "VARIABLE", "FINANCIERO"],
} as const;

type CamposInput = TipoGastoCamposLaboralInput | TipoGastoCamposPersonalInput;

// La clasificación disponible depende del ámbito (AC1/AC2) — el formulario
// nunca ofrece una clasificación que no corresponda, y el submit queda
// deshabilitado hasta elegir una (AC3, Task 2).
// [Source: architecture/frontend-architecture.md#Component Organization]
export function TipoGastoCatalogo({
  ambito,
  negocioId,
}: {
  ambito: "LABORAL" | "PERSONAL";
  negocioId: string | null;
}) {
  const [tiposGasto, setTiposGasto] = useState<TipoGasto[] | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const result = await listarTiposGasto(negocioId);
    if (result.ok) setTiposGasto(result.data);
  }, [negocioId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const schema = ambito === "LABORAL" ? tipoGastoCamposLaboralSchema : tipoGastoCamposPersonalSchema;
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isValid },
  } = useForm<CamposInput>({ resolver: zodResolver(schema), mode: "onChange" });

  async function onSubmit(data: CamposInput) {
    setServerMessage(null);
    const result = await crearTipoGasto({ ambito, negocioId, ...data });
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
        <div>
          <label htmlFor="nombre-tipo-gasto" className="block text-sm">
            Nombre
          </label>
          <input
            id="nombre-tipo-gasto"
            className="rounded border px-3 py-2"
            {...register("nombre")}
          />
          {errors.nombre && (
            <p role="alert" className="text-sm text-red-600">
              {errors.nombre.message}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="clasificacion" className="block text-sm">
            Clasificación
          </label>
          <select
            id="clasificacion"
            defaultValue=""
            className="rounded border px-3 py-2"
            {...register("clasificacion")}
          >
            <option value="" disabled>
              Elegí una clasificación
            </option>
            {OPCIONES_CLASIFICACION[ambito].map((opcion) => (
              <option key={opcion} value={opcion}>
                {opcion}
              </option>
            ))}
          </select>
          {errors.clasificacion && (
            <p role="alert" className="text-sm text-red-600">
              {errors.clasificacion.message}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={isSubmitting || !isValid}
          className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-50"
        >
          Agregar tipo de gasto
        </button>
      </form>

      {serverMessage && (
        <p role="alert" className="text-sm text-red-600">
          {serverMessage}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {tiposGasto?.map((t) => (
          <li key={t.id} className="flex items-center justify-between rounded border px-4 py-2">
            <p className="font-medium">{t.nombre}</p>
            <p className="text-xs text-gray-500">{t.clasificacion}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
