"use client";

import { useEffect } from "react";

// Inventario junta en una sola página dos componentes independientes
// (catálogo de productos y compra) que cada uno hace su propio fetch — sin
// esto, crear un producto en uno no se refleja en el otro hasta recargar la
// página. Un CustomEvent de `window` es el acople más simple entre dos
// client components hermanos sin necesidad de subir estado al padre (que
// rompería la reutilización de ambos en otras páginas).
const EVENTO = "inventario:items-cambiaron";

export function emitirInventarioCambiado(): void {
  window.dispatchEvent(new Event(EVENTO));
}

export function useInventarioCambiado(onCambio: () => void): void {
  useEffect(() => {
    window.addEventListener(EVENTO, onCambio);
    return () => window.removeEventListener(EVENTO, onCambio);
  }, [onCambio]);
}
