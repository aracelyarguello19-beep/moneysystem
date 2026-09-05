"use client";

import { ReportesPanel } from "@/components/reportes-panel";
import { useNegocioActivoStore } from "@/stores/negocio-activo.store";
import { PageHeader } from "@/components/ui/page-header";

export default function ReportesPage() {
  const negocioActivoId = useNegocioActivoStore((state) => state.negocioActivoId);

  return (
    <main className="flex flex-col gap-8 p-margin-mobile md:p-margin-desktop">
      <PageHeader title="Reportes" description="Productos más vendidos y gastos por categoría del período." />

      {!negocioActivoId ? (
        <p className="text-sm text-muted">
          Seleccioná un negocio activo para ver sus reportes.
        </p>
      ) : (
        <ReportesPanel negocioId={negocioActivoId} />
      )}
    </main>
  );
}
