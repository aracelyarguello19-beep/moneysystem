"use client";

import { CajaPanel } from "@/components/caja-panel";
import { CajaResumenMonedas } from "@/components/caja-resumen-monedas";
import { CajaTransacciones } from "@/components/caja-transacciones";
import { MonedaCatalogo } from "@/components/moneda-catalogo";
import { useNegocioActivoStore } from "@/stores/negocio-activo.store";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

// Caja — mismo layout que "Gestión de Caja Multimoneda" de Stitch: bento de
// saldo por moneda arriba, transacciones recientes, y debajo la gestión de
// cuentas (crear, tarjetas, otro) y monedas.
export default function CajaPage() {
  const negocioActivoId = useNegocioActivoStore((state) => state.negocioActivoId);

  return (
    <main className="flex flex-col gap-8 p-margin-mobile md:p-margin-desktop">
      <PageHeader title="Caja" description="Efectivo, bancos y tarjetas por moneda." />

      {!negocioActivoId ? (
        <p className="text-sm text-muted">
          Seleccioná un negocio activo para gestionar su caja.
        </p>
      ) : (
        <>
          <CajaResumenMonedas negocioId={negocioActivoId} />

          <CajaTransacciones negocioId={negocioActivoId} />

          <CajaPanel negocioId={negocioActivoId} />

          <Card>
            <CardHeader>
              <CardTitle>Monedas</CardTitle>
            </CardHeader>
            <MonedaCatalogo negocioId={negocioActivoId} />
          </Card>
        </>
      )}
    </main>
  );
}
