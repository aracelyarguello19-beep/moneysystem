"use client";

import { useCallback, useEffect, useState } from "react";
import type { GastoFijo, Moneda } from "@repo/domain";
import { calcularMetaMinimaDiaria } from "@repo/domain";
import { crearGastoFijo } from "@/actions/gastos/crear-gasto-fijo";
import { listarGastosFijos } from "@/actions/gastos/listar-gastos-fijos";
import { eliminarGastoFijo } from "@/actions/gastos/eliminar-gasto-fijo";
import { listarMonedas } from "@/actions/catalogos/listar-monedas";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { formatearMonto } from "@/lib/moneda";

// Gastos recurrentes (alquiler, sueldos, suscripciones) separados del
// registro día a día — su suma (solo activos) define la meta mínima diaria
// que se muestra en el Dashboard.
export function GastoFijoPanel({ negocioId }: { negocioId: string }) {
  const [gastosFijos, setGastosFijos] = useState<GastoFijo[]>([]);
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [nombre, setNombre] = useState("");
  const [monto, setMonto] = useState("");
  const [monedaId, setMonedaId] = useState("");

  const cargar = useCallback(async () => {
    const [gastosFijosResult, monedasResult] = await Promise.all([
      listarGastosFijos(negocioId),
      listarMonedas(negocioId),
    ]);
    if (gastosFijosResult.ok) setGastosFijos(gastosFijosResult.data);
    if (monedasResult.ok) {
      setMonedas(monedasResult.data.filter((m) => m.activa));
      setMonedaId((actual) => actual || monedasResult.data.find((m) => m.esBase)?.id || "");
    }
  }, [negocioId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerMessage(null);
    setIsSubmitting(true);
    const result = await crearGastoFijo(negocioId, { nombre, monto, monedaId });
    setIsSubmitting(false);
    if (!result.ok) {
      setServerMessage(result.error.message);
      return;
    }
    setNombre("");
    setMonto("");
    await cargar();
  }

  async function onEliminar(g: GastoFijo) {
    if (!window.confirm(`¿Eliminar el gasto fijo "${g.nombre}"? Esta acción no se puede deshacer.`)) return;
    const result = await eliminarGastoFijo(g.id, negocioId);
    if (result.ok) await cargar();
  }

  const metaMinimaDiaria = calcularMetaMinimaDiaria(gastosFijos);

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2" noValidate>
        <FormField htmlFor="nombre-gasto-fijo" label="Nombre">
          <Input id="nombre-gasto-fijo" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </FormField>
        <FormField htmlFor="monto-gasto-fijo" label="Monto mensual">
          <Input
            id="monto-gasto-fijo"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            required
            className="w-28"
          />
        </FormField>
        <FormField htmlFor="moneda-gasto-fijo" label="Moneda">
          <Select id="moneda-gasto-fijo" value={monedaId} onChange={(e) => setMonedaId(e.target.value)}>
            {monedas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.codigo}
              </option>
            ))}
          </Select>
        </FormField>
        <Button type="submit" disabled={isSubmitting}>
          Agregar gasto fijo
        </Button>
      </form>

      {serverMessage && (
        <p role="alert" className="text-sm text-danger">
          {serverMessage}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {gastosFijos.map((g) => (
          <Card key={g.id} className="flex items-center justify-between">
            <span className="text-sm">{g.nombre}</span>
            <span className="flex items-center gap-3 text-sm text-muted">
              {formatearMonto(g.monto, monedas.find((m) => m.id === g.monedaId)?.codigo)}
              <Button type="button" variant="link" onClick={() => onEliminar(g)}>
                Eliminar
              </Button>
            </span>
          </Card>
        ))}
      </div>

      {gastosFijos.length > 0 && (
        <p className="text-sm text-muted">
          Meta mínima diaria (total de fijos activos ÷ 20 días): <strong>{formatearMonto(metaMinimaDiaria)}</strong>
        </p>
      )}
    </div>
  );
}
