"use client";

import { ItemCatalogo } from "@/components/item-catalogo";
import { InventarioResumen } from "@/components/inventario-resumen";
import { CompraForm } from "@/components/compra-form";
import { useNegocioActivoStore } from "@/stores/negocio-activo.store";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

// Inventario reúne resumen (KPIs), catálogo de productos y registrar compra
// en una sola sesión — mismo layout que "Control de Inventario y Stock"
// (Stitch): "crear" un producto (stock 0, catálogo) y "comprar" (carga
// stock real) son acciones distintas a propósito, ver CompraForm.
export default function InventarioPage() {
  const negocioActivoId = useNegocioActivoStore((state) => state.negocioActivoId);

  return (
    <main className="flex flex-col gap-8 p-margin-mobile md:p-margin-desktop">
      <PageHeader
        title="Inventario"
        description="Gestión detallada de productos, existencias y valoración del stock."
      />

      {!negocioActivoId ? (
        <p className="text-sm text-muted">
          Seleccioná un negocio activo para gestionar su inventario.
        </p>
      ) : (
        <>
          <InventarioResumen negocioId={negocioActivoId} />

          <ItemCatalogo negocioId={negocioActivoId} />

          <Card>
            <CardHeader>
              <CardTitle>Compra de productos</CardTitle>
            </CardHeader>
            <CompraForm negocioId={negocioActivoId} />
          </Card>
        </>
      )}
    </main>
  );
}
