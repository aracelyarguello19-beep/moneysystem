"use client";

import { useState } from "react";
import { AppSidebar, MobileNavDrawer } from "@/components/app-sidebar";
import { UserMenu } from "@/components/user-menu";
import { Icon } from "@/components/ui/icon";

// Dueño del estado del drawer móvil — layout.tsx es un Server Component
// (necesita `await listarNegocios()` para el redirect a onboarding), así
// que el estado compartido entre el botón ☰ del header y el sidebar vive
// acá, en el único punto donde ambos son hermanos dentro de un mismo
// Client Component.
export function AppShell({ children }: { children: React.ReactNode }) {
  const [menuAbierto, setMenuAbierto] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <MobileNavDrawer open={menuAbierto} onClose={() => setMenuAbierto(false)} />

      <header className="fixed left-0 top-0 z-40 flex h-16 w-full items-center justify-between border-b border-outline-variant bg-surface/80 px-margin-mobile backdrop-blur-md md:left-sidebar-width-expanded md:w-[calc(100%-230px)] md:justify-end md:px-margin-desktop">
        <button
          type="button"
          onClick={() => setMenuAbierto(true)}
          aria-label="Abrir menú"
          className="rounded p-2 text-on-surface-variant hover:bg-surface-container-high md:hidden"
        >
          <Icon name="menu" />
        </button>
        <UserMenu />
      </header>

      <main className="min-h-screen pt-16 md:ml-sidebar-width-expanded">{children}</main>
    </div>
  );
}
