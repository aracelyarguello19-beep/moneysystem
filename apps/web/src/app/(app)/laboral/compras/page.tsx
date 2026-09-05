"use client";

import { CompraForm } from "@/components/compra-form";
import { useNegocioActivoStore } from "@/stores/negocio-activo.store";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

// Sesión "Productos" › Compras — el historial de cada compra tal cual se
// registró (columna Cantidad, no Stock: dos compras del mismo producto
// quedan como dos filas, cada una con su costo real) + el panel de
// "Registrar compra". El stock/valor combinado por producto vive en
// Inventario, no acá — ver item-catalogo.tsx.
export default function ComprasPage() {
  const negocioActivoId = useNegocioActivoStore((state) => state.negocioActivoId);

  return (
    <main className="flex flex-col gap-8 p-margin-mobile md:p-margin-desktop">
      <PageHeader title="Compras" description="Historial de compras del negocio activo." />

      {!negocioActivoId ? (
        <p className="text-sm text-muted">
          Seleccioná un negocio activo para registrar una compra.
        </p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Registrar compra</CardTitle>
          </CardHeader>
          <CompraForm negocioId={negocioActivoId} />
        </Card>
      )}
    </main>
  );
}
