"use client";

import type { Negocio } from "@repo/domain";
import { EditarNegocioButton } from "./editar-negocio-button";
import { EliminarNegocioButton } from "./eliminar-negocio-button";

export function MisNegociosLista({ negocios }: { negocios: Negocio[] }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase text-muted">Mis negocios</h2>

      <ul className="flex flex-col gap-2">
        {negocios.length === 0 && (
          <p className="text-sm text-muted">Todavía no tenés negocios.</p>
        )}
        {negocios.map((negocio) => (
          <li
            key={negocio.id}
            className="flex flex-col gap-2 rounded border border-default px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              {negocio.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- URL pública externa de Supabase Storage
                <img
                  src={negocio.logoUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded object-cover"
                />
              ) : (
                <div className="h-10 w-10 shrink-0 rounded bg-neutral-bg" />
              )}
              <div className="min-w-0">
                <p className="break-words font-medium">{negocio.nombre}</p>
                <p className="text-xs text-muted">
                  {negocio.estado} · {negocio.tipo}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <EditarNegocioButton
                negocioId={negocio.id}
                nombreActual={negocio.nombre}
                logoUrlActual={negocio.logoUrl}
              />
              <EliminarNegocioButton negocioId={negocio.id} nombre={negocio.nombre} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
