"use client";

import { useEffect, useState } from "react";
import type { Item } from "@repo/domain";
import { Input } from "@/components/ui/input";

// Dos números de calce del mismo modelo son ítems distintos (misma
// convención en toda la sesión "Productos") — la etiqueta los distingue acá
// para que buscar "tenis n" muestre ambos como sugerencias separadas.
export function etiquetaProducto(item: Pick<Item, "nombre" | "nroCalce">): string {
  return item.nroCalce ? `${item.nombre} · Nro ${item.nroCalce}` : item.nombre;
}

// Buscador con sugerencias para elegir un producto existente — reemplaza el
// `<select>` plano de "Registrar compra": escribís parte del nombre (o del
// nro de calce) y aparecen las coincidencias del catálogo.
export function ProductoBuscador({
  id,
  productos,
  value,
  onChange,
}: {
  id: string;
  productos: Item[];
  value: string;
  onChange: (itemId: string) => void;
}) {
  const seleccionado = productos.find((p) => p.id === value) ?? null;
  const [query, setQuery] = useState(seleccionado ? etiquetaProducto(seleccionado) : "");
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    setQuery(seleccionado ? etiquetaProducto(seleccionado) : "");
    // Solo resincroniza cuando cambia el ítem seleccionado desde afuera (ej.
    // "+ Nuevo producto" lo setea), no en cada tecla que el usuario escribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const filtrados = productos.filter((p) =>
    etiquetaProducto(p).toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="relative">
      <Input
        id={id}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder="Buscar producto..."
        autoComplete="off"
      />
      {abierto && filtrados.length > 0 && (
        // `max-w-[calc(100vw-2rem)]`: el `min-w-56` (224px) puede superar el
        // ancho del contenedor en mobile y sacar el desplegable del viewport.
        <ul className="absolute z-10 mt-1 max-h-56 w-full min-w-56 max-w-[calc(100vw-2rem)] overflow-auto rounded border border-outline-variant bg-surface-container-lowest shadow-lg">
          {filtrados.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={() => {
                  onChange(p.id);
                  setQuery(etiquetaProducto(p));
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
    </div>
  );
}
