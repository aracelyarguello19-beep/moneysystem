"use client";

import { RetiroForm } from "@/components/retiro-form";
import { ReglaRetiroConfig } from "@/components/regla-retiro-config";
import { useNegocioActivoStore } from "@/stores/negocio-activo.store";

export default function RetirosPage() {
  const negocioActivoId = useNegocioActivoStore((state) => state.negocioActivoId);

  return (
    <main className="flex flex-col gap-10 p-8">
      <h1 className="text-xl font-semibold">Retiro de utilidades</h1>

      {!negocioActivoId ? (
        <p className="text-sm text-gray-500">
          Seleccioná un negocio activo para retirar utilidades de él.
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-medium">Retiro manual</h2>
            <RetiroForm negocioId={negocioActivoId} />
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-medium">Regla de retiro predeterminado</h2>
            <ReglaRetiroConfig negocioId={negocioActivoId} />
          </section>
        </>
      )}
    </main>
  );
}
