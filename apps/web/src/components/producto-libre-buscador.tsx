"use client";

import { useState } from "react";
import type { Item } from "@repo/domain";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { etiquetaProducto } from "@/components/producto-buscador";

// Buscador de "Venta libre": arranca vacío para completar por cuenta propia
// (nunca fuerza a elegir del catálogo) pero sugiere productos existentes
// mientras se escribe. Elegir una sugerencia liga la línea a ese Item real
// (cuenta para estadísticas/reportes de ese producto); seguir escribiendo
// texto libre en cambio NO crea ni referencia ningún Item — la línea queda
// identificada solo por el texto, y únicamente aporta a los montos totales.
export function ProductoLibreBuscador({
  id,
  productos,
  texto,
  itemId,
  onChangeTexto,
  onSeleccionar,
}: {
  id: string;
  productos: Item[];
  texto: string;
  itemId: string | null;
  onChangeTexto: (texto: string) => void;
  onSeleccionar: (item: Item | null) => void;
}) {
  const [abierto, setAbierto] = useState(false);

  const filtrados = texto.trim()
    ? productos.filter((p) => etiquetaProducto(p).toLowerCase().includes(texto.trim().toLowerCase()))
    : [];

  return (
    <div className="relative">
      <Input
        id={id}
        value={texto}
        onChange={(e) => {
          onChangeTexto(e.target.value);
          onSeleccionar(null);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder="Nombre del producto..."
        autoComplete="off"
      />
      {abierto && filtrados.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full min-w-56 overflow-auto rounded border border-outline-variant bg-surface-container-lowest shadow-lg">
          {filtrados.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={() => {
                  onSeleccionar(p);
                  onChangeTexto(etiquetaProducto(p));
                  setAbierto(false);
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-body-md text-on-surface hover:bg-surface-container"
              >
                <span>{etiquetaProducto(p)}</span>
                <span className="text-label-md text-on-surface-variant">{p.stockActual} en stock</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {texto.trim() && (
        <p
          className={`mt-1 flex items-center gap-1 text-label-md ${itemId ? "text-success" : "text-on-surface-variant"}`}
        >
          <Icon name={itemId ? "check_circle" : "info"} fill={!!itemId} className="text-[14px]" />
          {itemId
            ? "Del catálogo — cuenta para las estadísticas de este producto."
            : "Fuera de catálogo — no se agrega al inventario, solo cuenta en los montos."}
        </p>
      )}
    </div>
  );
}
