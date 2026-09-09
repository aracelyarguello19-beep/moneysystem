"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  tipoGastoCamposLaboralSchema,
  type TipoGastoCamposLaboralInput,
} from "@repo/domain/schemas";
import type { TipoGasto } from "@repo/domain";
import { crearTipoGasto } from "@/actions/catalogos/crear-tipo-gasto";
import { eliminarTipoGasto } from "@/actions/catalogos/eliminar-tipo-gasto";
import { emitirGastoCambiado } from "@/lib/gasto-events";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const OPCIONES_CLASIFICACION = ["OPERATIVO", "FINANCIERO"] as const;

// La clasificación disponible se restringe a las Laboral (AC1) — el
// formulario nunca ofrece una clasificación que no corresponda, y el submit
// queda deshabilitado hasta elegir una (AC3, Task 2). `tiposGasto` llega por
// prop desde `GastosPanel` (una sola llamada consolidada para toda la
// página); crear/eliminar avisan por `gasto-events` en vez de recargar acá,
// así el panel recarga el catálogo completo una sola vez.
// [Source: architecture/frontend-architecture.md#Component Organization]
export function TipoGastoCatalogo({ negocioId, tiposGasto }: { negocioId: string; tiposGasto: TipoGasto[] }) {
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);

  async function onEliminar(t: TipoGasto) {
    if (!window.confirm(`¿Eliminar el tipo de gasto "${t.nombre}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    setServerMessage(null);
    setEliminandoId(t.id);
    const result = await eliminarTipoGasto(t.id, negocioId);
    setEliminandoId(null);
    if (!result.ok) {
      setServerMessage(result.error.message);
      return;
    }
    emitirGastoCambiado();
  }

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
    emitirGastoCambiado();
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Icon name="add" />
          Tipos de gasto
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tipos de gasto</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2"
            noValidate
          >
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
            <Button type="submit" disabled={isSubmitting || !isValid} className="sm:col-span-2 sm:justify-self-start">
              Agregar
            </Button>
          </form>

          {serverMessage && (
            <p role="alert" className="text-sm text-danger">
              {serverMessage}
            </p>
          )}

          <ul className="flex flex-col gap-2">
            {tiposGasto.map((t) => (
              <li
                key={t.id}
                className="flex flex-col gap-1 rounded border border-default px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:px-4"
              >
                <p className="min-w-0 break-words font-medium">{t.nombre}</p>
                <span className="flex flex-wrap items-center gap-3 sm:shrink-0">
                  <p className="text-xs text-muted">{t.clasificacion}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="link"
                    onClick={() => onEliminar(t)}
                    disabled={eliminandoId === t.id}
                  >
                    Eliminar
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
