"use client";

import { IndicadoresPanel } from "@/components/indicadores-panel";
import { useNegocioActivoStore } from "@/stores/negocio-activo.store";

export default function IndicadoresPage() {
  const negocioActivoId = useNegocioActivoStore((state) => state.negocioActivoId);

  return (
    <main className="flex flex-col gap-6 p-8">
      {!negocioActivoId ? (
        <>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted">
            Seleccioná un negocio activo para ver sus indicadores.
          </p>
        </>
      ) : (
        <IndicadoresPanel negocioId={negocioActivoId} />
      )}
    </main>
  );
}
