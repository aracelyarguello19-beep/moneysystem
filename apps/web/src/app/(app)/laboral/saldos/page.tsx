"use client";

import { SaldosPanel } from "@/components/saldos-panel";
import { useNegocioActivoStore } from "@/stores/negocio-activo.store";

export default function SaldosPage() {
  const negocioActivoId = useNegocioActivoStore((state) => state.negocioActivoId);

  return (
    <main className="flex flex-col gap-6 p-8">
      <h1 className="text-xl font-semibold">Saldos de caja y banco</h1>

      {!negocioActivoId ? (
        <p className="text-sm text-gray-500">
          Seleccioná un negocio activo para ver sus saldos.
        </p>
      ) : (
        <SaldosPanel negocioId={negocioActivoId} />
      )}
    </main>
  );
}
