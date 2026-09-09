"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface RangoFecha {
  desde: string;
  hasta: string;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const ATAJOS: { label: string; calcular: () => RangoFecha }[] = [
  { label: "Hoy", calcular: () => ({ desde: iso(new Date()), hasta: iso(new Date()) }) },
  {
    label: "Esta semana",
    calcular: () => {
      const hoy = new Date();
      const inicio = new Date(hoy);
      inicio.setDate(hoy.getDate() - hoy.getDay());
      return { desde: iso(inicio), hasta: iso(hoy) };
    },
  },
  {
    label: "Este mes",
    calcular: () => {
      const hoy = new Date();
      return { desde: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: iso(hoy) };
    },
  },
  {
    label: "Este año",
    calcular: () => {
      const hoy = new Date();
      return { desde: iso(new Date(hoy.getFullYear(), 0, 1)), hasta: iso(hoy) };
    },
  },
  {
    label: "Últimos 7 días",
    calcular: () => {
      const hoy = new Date();
      const inicio = new Date(hoy);
      inicio.setDate(hoy.getDate() - 6);
      return { desde: iso(inicio), hasta: iso(hoy) };
    },
  },
  {
    label: "Últimos 30 días",
    calcular: () => {
      const hoy = new Date();
      const inicio = new Date(hoy);
      inicio.setDate(hoy.getDate() - 29);
      return { desde: iso(inicio), hasta: iso(hoy) };
    },
  },
  {
    label: "Últimos 60 días",
    calcular: () => {
      const hoy = new Date();
      const inicio = new Date(hoy);
      inicio.setDate(hoy.getDate() - 59);
      return { desde: iso(inicio), hasta: iso(hoy) };
    },
  },
];

function formatearFecha(fecha: string): string {
  const [y, m, d] = fecha.split("-");
  return `${d}/${m}/${y}`;
}

// Selector de rango con atajos rápidos (Hoy/Semana/Mes/Año/Últimos N días)
// más un rango manual — reemplaza los inputs de fecha sueltos en vistas de
// indicadores/dashboard para que ver "hoy" o "este mes" sea un clic, no
// escribir dos fechas a mano.
export function DateRangePicker({
  value,
  onChange,
}: {
  value: RangoFecha;
  onChange: (rango: RangoFecha) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [desdeManual, setDesdeManual] = useState(value.desde);
  const [hastaManual, setHastaManual] = useState(value.hasta);
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDesdeManual(value.desde);
    setHastaManual(value.hasta);
  }, [value.desde, value.hasta]);

  useEffect(() => {
    function onClickAfuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", onClickAfuera);
    return () => document.removeEventListener("mousedown", onClickAfuera);
  }, []);

  return (
    <div ref={contenedorRef} className="relative inline-block">
      <Button type="button" variant="outline" size="sm" onClick={() => setAbierto((v) => !v)}>
        Del {formatearFecha(value.desde)} al {formatearFecha(value.hasta)}
      </Button>

      {abierto && (
        // `max-w-[calc(100vw-2rem)]`: el popover mide 288px fijos y, si el
        // disparador cae cerca del borde derecho en mobile, se sale del viewport.
        <div className="absolute left-0 top-full z-10 mt-1 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-1 rounded border border-default bg-surface-elevated p-2 shadow-lg">
          <p className="px-1 text-xs uppercase text-subtle">Atajos rápidos</p>
          {ATAJOS.map((atajo) => (
            <Button
              key={atajo.label}
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                onChange(atajo.calcular());
                setAbierto(false);
              }}
            >
              {atajo.label}
            </Button>
          ))}

          <div className="mt-1 flex flex-col gap-1 border-t pt-2">
            <p className="px-1 text-xs uppercase text-subtle">Rango manual</p>
            {/* Apilados en mobile: dos `input[type=date]` lado a lado dentro
                de un popover de 288px quedan por debajo de su ancho mínimo
                intrínseco y el navegador recorta el control de calendario. */}
            <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-center">
              <Input
                type="date"
                aria-label="Desde"
                value={desdeManual}
                onChange={(e) => setDesdeManual(e.target.value)}
              />
              <span className="text-xs text-subtle">a</span>
              <Input
                type="date"
                aria-label="Hasta"
                value={hastaManual}
                onChange={(e) => setHastaManual(e.target.value)}
              />
            </div>
            <Button
              type="button"
              size="sm"
              className="mx-1 mt-1"
              onClick={() => {
                onChange({ desde: desdeManual, hasta: hastaManual });
                setAbierto(false);
              }}
            >
              Aplicar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
