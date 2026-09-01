"use client";

import { GastoForm } from "@/components/gasto-form";
import { useNegocioActivoStore } from "@/stores/negocio-activo.store";

export default function GastosPage() {
  const negocioActivoId = useNegocioActivoStore((state) => state.negocioActivoId);

  return (
    <main className="flex flex-col gap-6 p-8">
      <h1 className="text-xl font-semibold">Gastos</h1>

      {!negocioActivoId ? (
        <p className="text-sm text-gray-500">
          Seleccioná un negocio activo para registrar un gasto.
        </p>
      ) : (
        <GastoForm negocioId={negocioActivoId} />
      )}
    </main>
  );
}
