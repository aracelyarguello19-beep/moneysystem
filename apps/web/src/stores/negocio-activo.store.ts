import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TipoNegocio } from "@repo/domain";

// Estado de UI efímera/navegación (negocio activo) — nunca datos que vienen
// del servidor. Persistido en localStorage para recordar la última
// selección entre sesiones, sin volver a pedirla. `negocioActivoTipo` viaja
// junto al id para que el dashboard y el menú lateral decidan qué mostrar
// (CMV/CSV, Productos/Servicios) sin tener que volver a pedir el negocio.
// [Source: architecture/frontend-architecture.md#State Management Architecture]
export interface NegocioActivoState {
  negocioActivoId: string | null;
  negocioActivoTipo: TipoNegocio | null;
  setNegocioActivo: (negocioId: string, tipo: TipoNegocio) => void;
}

export const useNegocioActivoStore = create<NegocioActivoState>()(
  persist(
    (set) => ({
      negocioActivoId: null,
      negocioActivoTipo: null,
      setNegocioActivo: (negocioId, tipo) =>
        set({ negocioActivoId: negocioId, negocioActivoTipo: tipo }),
    }),
    { name: "negocio-activo" }
  )
);
