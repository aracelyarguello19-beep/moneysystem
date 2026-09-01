"use client";

import { CompraForm } from "@/components/compra-form";
import { useNegocioActivoStore } from "@/stores/negocio-activo.store";

export default function ComprasPage() {
  const negocioActivoId = useNegocioActivoStore((state) => state.negocioActivoId);

  return (
    <main className="flex flex-col gap-6 p-8">
      <h1 className="text-xl font-semibold">Registrar compra</h1>

      {!negocioActivoId ? (
        <p className="text-sm text-gray-500">
          Seleccioná un negocio activo para registrar una compra.
        </p>
      ) : (
        <CompraForm negocioId={negocioActivoId} />
      )}
    </main>
  );
}
