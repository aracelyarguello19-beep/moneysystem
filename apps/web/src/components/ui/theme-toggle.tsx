"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";

/**
 * Toggle de tema light/dark. Aplica la clase `.dark` en <html>, que es todo
 * lo que necesitan los tokens definidos en globals.css. Persistido en
 * localStorage; si no hay preferencia guardada, respeta prefers-color-scheme.
 */
export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = stored ? stored === "dark" : prefersDark;
    setIsDark(dark);
    document.documentElement.classList.toggle("dark", dark);
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      title={isDark ? "Modo claro" : "Modo oscuro"}
    >
      <Icon name={isDark ? "light_mode" : "dark_mode"} />
    </button>
  );
}
