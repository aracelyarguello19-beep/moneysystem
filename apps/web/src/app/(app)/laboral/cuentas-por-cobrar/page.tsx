"use client";

import { CuentasPorCobrarLista } from "@/components/cuentas-por-cobrar-lista";
import { useNegocioActivoStore } from "@/stores/negocio-activo.store";

export default function CuentasPorCobrarPage() {
  const negocioActivoId = useNegocioActivoStore((state) => state.negocioActivoId);

  return (
    <main className="flex flex-col gap-6 p-8">
      <h1 className="text-xl font-semibold">Cuentas por cobrar</h1>

      {!negocioActivoId ? (
        <p className="text-sm text-gray-500">
          Seleccioná un negocio activo para ver sus cuentas por cobrar.
        </p>
      ) : (
        <CuentasPorCobrarLista negocioId={negocioActivoId} />
      )}
    </main>
  );
}
