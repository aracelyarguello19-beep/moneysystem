"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Negocio } from "@repo/domain";
import { listarNegocios } from "@/actions/negocios/listar-negocios";
import { useNegocioActivoStore } from "@/stores/negocio-activo.store";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

// Switcher de negocio activo — puro, sin acciones de cuenta (Mi perfil /
// Cerrar sesión viven en UserMenu, a la derecha del header).
export function MisNegociosMenu() {
  const [negocios, setNegocios] = useState<Negocio[] | null>(null);
  const [abierto, setAbierto] = useState(false);
  const { negocioActivoId, setNegocioActivo } = useNegocioActivoStore();
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listarNegocios().then((result) => {
      if (!result.ok) return;
      setNegocios(result.data);

      const activoSigueValido = result.data.some(
        (n) => n.id === negocioActivoId && n.estado === "ACTIVO"
      );
      const primerActivo = result.data.find((n) => n.estado === "ACTIVO");
      if (!activoSigueValido && primerActivo) {
        setNegocioActivo(primerActivo.id, primerActivo.tipo);
      }
    });
    // Solo se ejecuta al montar: la selección posterior la maneja el usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onClickAfuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", onClickAfuera);
    return () => document.removeEventListener("mousedown", onClickAfuera);
  }, []);

  const negociosActivos = negocios?.filter((n) => n.estado === "ACTIVO") ?? [];
  const negocioActivo = negociosActivos.find((n) => n.id === negocioActivoId);

  return (
    <div ref={contenedorRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setAbierto((v) => !v)}
        className="w-full justify-between"
      >
        <span className="truncate">
          {negocioActivo ? negocioActivo.nombre : "Mis negocios"}
        </span>
        <Icon name="expand_more" className="ml-2 text-[16px]" />
      </Button>

      {abierto && (
        <div className="absolute left-0 top-full z-10 mt-1 w-56 rounded border border-default bg-surface-elevated py-1 shadow-lg">
          <p className="px-3 py-1 text-xs uppercase text-subtle">Mis negocios</p>
          {negociosActivos.length === 0 && (
            <p className="px-3 py-1 text-sm text-muted">Todavía no tenés negocios activos.</p>
          )}
          {negociosActivos.map((n) => (
            <Button
              key={n.id}
              type="button"
              variant="ghost"
              onClick={() => {
                setNegocioActivo(n.id, n.tipo);
                setAbierto(false);
              }}
              className={`w-full justify-between font-normal ${
                n.id === negocioActivoId ? "font-semibold" : ""
              }`}
            >
              {n.nombre}
              {n.id === negocioActivoId && <Icon name="check" className="text-[16px] text-primary" />}
            </Button>
          ))}

          <Link
            href="/negocios"
            onClick={() => setAbierto(false)}
            className="flex items-center gap-1.5 border-t px-3 py-2 text-sm hover:bg-neutral-bg"
          >
            <Icon name="add" className="text-[16px]" />
            Crear / administrar negocios
          </Link>
        </div>
      )}
    </div>
  );
}
