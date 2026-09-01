"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { monedaCamposSchema, type MonedaCamposInput } from "@repo/domain/schemas";
import type { Moneda } from "@repo/domain";
import { crearMoneda } from "@/actions/catalogos/crear-moneda";
import { listarMonedas } from "@/actions/catalogos/listar-monedas";
import { desactivarMoneda } from "@/actions/catalogos/desactivar-moneda";

// Catálogo de monedas por ámbito — usado tanto en la configuración del
// negocio activo (LABORAL) como en la de Personal (PERSONAL, negocioId
// null). `ambito`/`negocioId` los resuelve la página contenedora a partir
// del contexto (selector de negocio activo), nunca el usuario en el
// formulario. [Source: architecture/frontend-architecture.md#Component Organization]
export function MonedaCatalogo({
  ambito,
  negocioId,
}: {
  ambito: "LABORAL" | "PERSONAL";
  negocioId: string | null;
}) {
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
    const result = await crearMoneda({ ambito, negocioId, ...data });
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
        <div>
          <label htmlFor="codigo" className="block text-sm">
            Código
          </label>
          <input id="codigo" className="w-24 rounded border px-3 py-2" {...register("codigo")} />
          {errors.codigo && (
            <p role="alert" className="text-sm text-red-600">
              {errors.codigo.message}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="nombre-moneda" className="block text-sm">
            Nombre
          </label>
          <input id="nombre-moneda" className="rounded border px-3 py-2" {...register("nombre")} />
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
          Agregar moneda
        </button>
      </form>

      {serverMessage && (
        <p role="alert" className="text-sm text-red-600">
          {serverMessage}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {monedas?.map((m) => (
          <li key={m.id} className="flex items-center justify-between rounded border px-4 py-2">
            <div>
              <p className="font-medium">
                {m.codigo} — {m.nombre}
                {m.esBase && " (base)"}
              </p>
              <p className="text-xs text-gray-500">{m.activa ? "Activa" : "Desactivada"}</p>
            </div>
            {m.activa && !m.esBase && (
              <button
                type="button"
                onClick={() => onDesactivar(m.id)}
                className="text-sm text-red-600 underline"
              >
                Desactivar
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
