"use client";

import { CajaPanel } from "@/components/caja-panel";
import { CajaResumenMonedas } from "@/components/caja-resumen-monedas";
import { CajaTransacciones } from "@/components/caja-transacciones";
import { useNegocioActivoStore } from "@/stores/negocio-activo.store";
import { PageHeader } from "@/components/ui/page-header";

// Caja: bento de saldo por moneda y gestión de cuentas (crear, tarjetas,
// otro) y monedas arriba — transacciones recientes al final, mismo criterio
// que el historial de Compras/Gastos (formulario/gestión primero, log
// después).
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

          <CajaPanel negocioId={negocioActivoId} />

          <CajaTransacciones negocioId={negocioActivoId} />
        </>
      )}
    </main>
  );
}
