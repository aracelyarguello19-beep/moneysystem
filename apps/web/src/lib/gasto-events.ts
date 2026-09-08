"use client";

import { useEffect } from "react";

// Mismo mecanismo que `inventario-events.ts`: el formulario de registrar
// gasto y la lista de gastos son componentes hermanos independientes (cada
// uno hace su propio fetch) — sin esto, registrar/editar un gasto en uno no
// se reflejaría en el otro hasta recargar la página.
const EVENTO = "gastos:cambiaron";

export function emitirGastoCambiado(): void {
  window.dispatchEvent(new Event(EVENTO));
}

export function useGastoCambiado(onCambio: () => void): void {
  useEffect(() => {
    window.addEventListener(EVENTO, onCambio);
    return () => window.removeEventListener(EVENTO, onCambio);
  }, [onCambio]);
}
