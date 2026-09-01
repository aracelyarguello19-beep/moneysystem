import { create } from "zustand";
import { persist } from "zustand/middleware";

// Estado de UI efímera/navegación (ámbito activo, negocio activo) — nunca
// datos que vienen del servidor. Persistido en localStorage para recordar la
// última selección entre sesiones, sin volver a pedirla.
// [Source: architecture/frontend-architecture.md#State Management Architecture]
export interface NegocioActivoState {
  ambito: "LABORAL" | "PERSONAL";
  negocioActivoId: string | null;
  setAmbito: (ambito: "LABORAL" | "PERSONAL") => void;
  setNegocioActivo: (negocioId: string) => void;
}

export const useNegocioActivoStore = create<NegocioActivoState>()(
  persist(
    (set) => ({
      ambito: "LABORAL",
      negocioActivoId: null,
      setAmbito: (ambito) => set({ ambito }),
      setNegocioActivo: (negocioId) => set({ negocioActivoId: negocioId }),
    }),
    { name: "negocio-activo" }
  )
);
