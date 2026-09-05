"use client";

import { useCallback, useEffect, useState } from "react";
import type { Item, Moneda } from "@repo/domain";
import { ItemCatalogo } from "@/components/item-catalogo";
import { InventarioResumen } from "@/components/inventario-resumen";
import { obtenerInventario } from "@/actions/inventario/obtener-inventario";
import { useNegocioActivoStore } from "@/stores/negocio-activo.store";
import { useInventarioCambiado } from "@/lib/inventario-events";
import { PageHeader } from "@/components/ui/page-header";

// Sesión "Productos" › Inventario: resumen (KPIs) + catálogo con stock y
// valorización combinados por producto. Registrar una compra vive en su
// propia sesión, "Compras" (`/laboral/compras`) — acá solo se ve el
// resultado acumulado, nunca el historial puntual de cada compra.
//
// El fetch vive acá (no en cada componente hijo) para pedir todo en UNA
// transacción — antes InventarioResumen e ItemCatalogo pedían por separado
// (y se pisaban leyendo `items` dos veces cada uno), 4 round-trips remotos
// para cargar una sola página. Ver obtener-inventario.ts.
export default function InventarioPage() {
  const negocioActivoId = useNegocioActivoStore((state) => state.negocioActivoId);
  const [items, setItems] = useState<Item[]>([]);
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [valorInventario, setValorInventario] = useState("0");

  const cargar = useCallback(async () => {
    if (!negocioActivoId) return;
    const result = await obtenerInventario(negocioActivoId);
    if (result.ok) {
      setItems(result.data.items);
      setMonedas(result.data.monedas);
      setValorInventario(result.data.valorInventario);
    }
  }, [negocioActivoId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useInventarioCambiado(cargar);

  return (
    <main className="flex flex-col gap-8 p-margin-mobile md:p-margin-desktop">
      <PageHeader
        title="Inventario"
        description="Stock y valorización por producto, con foto y costo promedio ponderado."
      />

      {!negocioActivoId ? (
        <p className="text-sm text-muted">
          Seleccioná un negocio activo para gestionar su inventario.
        </p>
      ) : (
        <>
          <InventarioResumen items={items} valorInventario={valorInventario} />

          <ItemCatalogo
            negocioId={negocioActivoId}
            items={items}
            monedas={monedas}
            onCambio={cargar}
          />
        </>
      )}
    </main>
  );
}
