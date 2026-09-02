"use client";

import { GastoForm } from "@/components/gasto-form";
import { TipoGastoCatalogo } from "@/components/tipo-gasto-catalogo";
import { GastoFijoPanel } from "@/components/gasto-fijo-panel";
import { GastosPorTipoChart } from "@/components/gastos-por-tipo-chart";
import { useNegocioActivoStore } from "@/stores/negocio-activo.store";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

export default function GastosPage() {
  const negocioActivoId = useNegocioActivoStore((state) => state.negocioActivoId);

  return (
    <main className="flex flex-col gap-8 p-margin-mobile md:p-margin-desktop">
      <PageHeader title="Gastos" description="Registro y análisis de gastos operativos del negocio." />

      {!negocioActivoId ? (
        <p className="text-sm text-muted">
          Seleccioná un negocio activo para registrar un gasto.
        </p>
      ) : (
        <>
          <GastosPorTipoChart negocioId={negocioActivoId} />

          <Card>
            <CardHeader>
              <CardTitle>Registrar gasto</CardTitle>
            </CardHeader>
            <GastoForm negocioId={negocioActivoId} />
          </Card>

          <section className="flex flex-col gap-4">
            <h2 className="text-headline-sm font-bold text-on-surface">Gastos fijos</h2>
            <GastoFijoPanel negocioId={negocioActivoId} />
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-headline-sm font-bold text-on-surface">Tipos de gasto</h2>
            <TipoGastoCatalogo negocioId={negocioActivoId} />
          </section>
        </>
      )}
    </main>
  );
}
