"use client";

import { TarjetaPanel } from "@/components/tarjeta-panel";
import { useNegocioActivoStore } from "@/stores/negocio-activo.store";

export default function TarjetaPage() {
  const negocioActivoId = useNegocioActivoStore((state) => state.negocioActivoId);

  return (
    <main className="flex flex-col gap-6 p-8">
      <h1 className="text-xl font-semibold">Tarjeta de crédito</h1>

      {!negocioActivoId ? (
        <p className="text-sm text-gray-500">
          Seleccioná un negocio activo para ver sus tarjetas.
        </p>
      ) : (
        <TarjetaPanel negocioId={negocioActivoId} />
      )}
    </main>
  );
}
