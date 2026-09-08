"use client";

import { GastosPanel } from "@/components/gastos-panel";
import { useNegocioActivoStore } from "@/stores/negocio-activo.store";
import { PageHeader } from "@/components/ui/page-header";

export default function GastosPage() {
  const negocioActivoId = useNegocioActivoStore((state) => state.negocioActivoId);

  if (!negocioActivoId) {
    return (
      <main className="flex flex-col gap-8 p-margin-mobile md:p-margin-desktop">
        <PageHeader
          title="Gastos"
          description="Registro y análisis de gastos operativos del negocio."
        />
        <p className="text-sm text-muted">Seleccioná un negocio activo para registrar un gasto.</p>
      </main>
    );
  }

  return <GastosPanel negocioId={negocioActivoId} />;
}
