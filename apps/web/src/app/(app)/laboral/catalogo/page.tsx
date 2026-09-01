"use client";

import { ItemCatalogo } from "@/components/item-catalogo";
import { InventarioValor } from "@/components/inventario-valor";
import { useNegocioActivoStore } from "@/stores/negocio-activo.store";

// Depende del negocio activo (selección client-side persistida en
// localStorage), por eso es un Client Component, igual que
// laboral/configuracion.
export default function CatalogoItemsPage() {
  const negocioActivoId = useNegocioActivoStore((state) => state.negocioActivoId);

  return (
    <main className="flex flex-col gap-10 p-8">
      <h1 className="text-xl font-semibold">Catálogo de ítems</h1>

      {!negocioActivoId ? (
        <p className="text-sm text-gray-500">
          Seleccioná un negocio activo para gestionar su catálogo de ítems.
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-medium">Ítems</h2>
            <ItemCatalogo negocioId={negocioActivoId} />
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-medium">Valor de inventario</h2>
            <InventarioValor negocioId={negocioActivoId} />
          </section>
        </>
      )}
    </main>
  );
}
