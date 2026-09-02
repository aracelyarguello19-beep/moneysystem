"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "@/actions/auth/sign-out";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ThemeToggle } from "@/components/ui/theme-toggle";

// TopNavBar (derecha): tema + notificaciones + avatar de cuenta — mismo
// patrón que el header de "Fiscal Precision" (Stitch). Separado del
// switcher de negocio (MisNegociosMenu), que vive en el sidebar.
export function UserMenu() {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickAfuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", onClickAfuera);
    return () => document.removeEventListener("mousedown", onClickAfuera);
  }, []);

  return (
    <div className="flex items-center gap-1">
      <ThemeToggle />
      <div ref={contenedorRef} className="relative ml-2">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-outline-variant bg-primary-container text-on-primary-container transition-opacity hover:opacity-90"
          aria-label="Cuenta"
        >
          <Icon name="person" />
        </button>

        {abierto && (
          <div className="absolute right-0 top-full z-10 mt-2 w-48 rounded-lg border border-outline-variant bg-surface-container-lowest py-1 shadow-lg">
            <Link
              href="/perfil"
              onClick={() => setAbierto(false)}
              className="flex items-center gap-2 px-3 py-2 text-body-md text-on-surface hover:bg-surface-container-high"
            >
              <Icon name="account_circle" className="text-[18px]" />
              Mi perfil
            </Link>
            <form action={signOut}>
              <Button type="submit" variant="ghost" className="w-full justify-start gap-2 font-normal">
                <Icon name="logout" className="text-[18px]" />
                Cerrar sesión
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
