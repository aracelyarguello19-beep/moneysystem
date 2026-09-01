"use client";

import { useEffect, useState } from "react";
import type { Negocio } from "@repo/domain";
import { listarNegocios } from "@/actions/negocios/listar-negocios";
import { useNegocioActivoStore } from "@/stores/negocio-activo.store";

// Disponible en toda pantalla del módulo Laboral (AC3, Story 1.4).
// [Source: architecture/frontend-architecture.md#Component Organization]
export function NegocioSelector() {
  const [negocios, setNegocios] = useState<Negocio[] | null>(null);
  const { ambito, negocioActivoId, setAmbito, setNegocioActivo } = useNegocioActivoStore();

  useEffect(() => {
    listarNegocios().then((result) => {
      if (!result.ok) return;
      setNegocios(result.data);

      const activoSigueValido = result.data.some(
        (n) => n.id === negocioActivoId && n.estado === "ACTIVO"
      );
      const primerActivo = result.data.find((n) => n.estado === "ACTIVO");
      if (!activoSigueValido && primerActivo) {
        setNegocioActivo(primerActivo.id);
      }
    });
    // Solo se ejecuta al montar: la selección posterior la maneja el usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor="ambito-selector" className="sr-only">
        Ámbito
      </label>
      <select
        id="ambito-selector"
        value={ambito}
        onChange={(e) => setAmbito(e.target.value as "LABORAL" | "PERSONAL")}
        className="rounded border px-2 py-1"
      >
        <option value="LABORAL">Laboral</option>
        <option value="PERSONAL">Personal</option>
      </select>

      {ambito === "LABORAL" && (
        <>
          <label htmlFor="negocio-selector" className="sr-only">
            Negocio activo
          </label>
          <select
            id="negocio-selector"
            value={negocioActivoId ?? ""}
            onChange={(e) => setNegocioActivo(e.target.value)}
            className="rounded border px-2 py-1"
          >
            {!negocios && <option value="">Cargando…</option>}
            {negocios?.length === 0 && <option value="">Sin negocios</option>}
            {negocios
              ?.filter((n) => n.estado === "ACTIVO")
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nombre}
                </option>
              ))}
          </select>
        </>
      )}
    </div>
  );
}
