import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Sin esto, el DOM renderizado por un test queda montado para el siguiente
// test del mismo archivo (vitest no llama `globals: true`, así que RTL no
// registra su auto-cleanup implícito) — un archivo con 2+ tests que hacen
// `render()` puede ver elementos "fantasma" de un test anterior.
afterEach(() => {
  cleanup();
});

// Node 22+ expone un `localStorage` global experimental que, en este
// entorno, queda como un stub roto (`storage.setItem is not a function`) y
// tapa el localStorage real de jsdom en los tests con `@vitest-environment
// jsdom`. Se reemplaza acá por una implementación mínima en memoria — solo
// afecta a tests, nunca al build de producción.
if (typeof window !== "undefined") {
  class MemoryStorage implements Storage {
    private store = new Map<string, string>();
    get length() {
      return this.store.size;
    }
    clear(): void {
      this.store.clear();
    }
    getItem(key: string): string | null {
      return this.store.has(key) ? this.store.get(key)! : null;
    }
    key(index: number): string | null {
      return Array.from(this.store.keys())[index] ?? null;
    }
    removeItem(key: string): void {
      this.store.delete(key);
    }
    setItem(key: string, value: string): void {
      this.store.set(key, value);
    }
  }

  Object.defineProperty(window, "localStorage", {
    value: new MemoryStorage(),
    configurable: true,
  });
}
