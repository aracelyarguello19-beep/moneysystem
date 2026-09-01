"use client";

import { RegistrarVentaForm } from "@/components/forms/registrar-venta-form";
import { VentasLista } from "@/components/ventas-lista";
import { useNegocioActivoStore } from "@/stores/negocio-activo.store";

export default function VentasPage() {
  const negocioActivoId = useNegocioActivoStore((state) => state.negocioActivoId);

  return (
    <main className="flex flex-col gap-10 p-8">
      <h1 className="text-xl font-semibold">Ventas</h1>

      {!negocioActivoId ? (
        <p className="text-sm text-gray-500">
          Seleccioná un negocio activo para registrar una venta.
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-medium">Registrar venta</h2>
            <RegistrarVentaForm negocioId={negocioActivoId} />
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-medium">Últimas ventas</h2>
            <VentasLista negocioId={negocioActivoId} />
          </section>
        </>
      )}
    </main>
  );
}
