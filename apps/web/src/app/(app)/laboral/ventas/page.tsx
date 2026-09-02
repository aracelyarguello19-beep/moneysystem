"use client";

import { RegistrarVentaForm } from "@/components/forms/registrar-venta-form";
import { VentasLista } from "@/components/ventas-lista";
import { useNegocioActivoStore } from "@/stores/negocio-activo.store";
import { PageHeader } from "@/components/ui/page-header";

export default function VentasPage() {
  const negocioActivoId = useNegocioActivoStore((state) => state.negocioActivoId);

  return (
    <main className="flex flex-col gap-8 p-margin-mobile md:p-margin-desktop">
      <PageHeader title="Ventas" description="Registrá una venta y consultá el historial del negocio." />

      {!negocioActivoId ? (
        <p className="text-sm text-muted">
          Seleccioná un negocio activo para registrar una venta.
        </p>
      ) : (
        <>
          <RegistrarVentaForm negocioId={negocioActivoId} />

          <section className="flex flex-col gap-4">
            <h2 className="text-headline-sm font-bold text-on-surface">Historial de ventas</h2>
            <VentasLista negocioId={negocioActivoId} />
          </section>
        </>
      )}
    </main>
  );
}
