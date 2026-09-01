"use client";

import { useEffect, useState } from "react";
import type { RetiroUtilidad } from "@repo/domain";
import { listarRetiros } from "@/actions/personal/listar-retiros";
import { listarNegocios } from "@/actions/negocios/listar-negocios";

// AC2/AC4: historial de retiros agregado en Personal, identificado con su
// negocio de origen (FR25). Se apoya en la RLS "relajada" de
// `retiros_utilidad` (Story 6.1, Dev Notes) — no usa el bypass '*' de
// Story 5.4 porque no es una vista consolidada de indicadores, solo un
// listado de una tabla que ya permite lectura cross-negocio por diseño.
export function RetirosConsolidado() {
  const [retiros, setRetiros] = useState<RetiroUtilidad[]>([]);
  const [nombresPorNegocio, setNombresPorNegocio] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listarRetiros(null), listarNegocios()]).then(([retirosResult, negociosResult]) => {
      if (retirosResult.ok) setRetiros(retirosResult.data);
      else setMensaje(retirosResult.error.message);

      if (negociosResult.ok) {
        setNombresPorNegocio(
          Object.fromEntries(negociosResult.data.map((n) => [n.id, n.nombre]))
        );
      }
    });
  }, []);

  if (mensaje) {
    return (
      <p role="alert" className="text-sm text-red-600">
        {mensaje}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {retiros.map((r) => (
        <li key={r.id} className="flex items-center justify-between rounded border px-4 py-2 text-sm">
          <span>
            {nombresPorNegocio[r.negocioId] ?? r.negocioId} · {r.fecha.toString().slice(0, 10)}
          </span>
          <span className="text-gray-500">{r.monto}</span>
        </li>
      ))}
      {retiros.length === 0 && (
        <p className="text-sm text-gray-500">Todavía no hay retiros registrados en ningún negocio.</p>
      )}
    </ul>
  );
}
