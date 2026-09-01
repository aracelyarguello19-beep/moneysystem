"use client";

import { MonedaCatalogo } from "@/components/moneda-catalogo";
import { TipoGastoCatalogo } from "@/components/tipo-gasto-catalogo";
import { useNegocioActivoStore } from "@/stores/negocio-activo.store";

// El catálogo Laboral depende del negocio activo (selección client-side
// persistida en localStorage), por eso esta página es un Client Component.
export default function ConfiguracionLaboralPage() {
  const negocioActivoId = useNegocioActivoStore((state) => state.negocioActivoId);

  return (
    <main className="flex flex-col gap-10 p-8">
      <h1 className="text-xl font-semibold">Configuración del negocio</h1>

      {!negocioActivoId ? (
        <p className="text-sm text-gray-500">
          Seleccioná un negocio activo para gestionar su configuración.
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-medium">Monedas</h2>
            <MonedaCatalogo ambito="LABORAL" negocioId={negocioActivoId} />
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-medium">Tipos de gasto</h2>
            <TipoGastoCatalogo ambito="LABORAL" negocioId={negocioActivoId} />
          </section>
        </>
      )}
    </main>
  );
}
