"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MisNegociosMenu } from "@/components/mis-negocios-menu";
import { Icon } from "@/components/ui/icon";

const NAV_ITEMS = [
  { href: "/laboral/indicadores", label: "Dashboard", icon: "dashboard" },
  { href: "/laboral/ventas", label: "Ventas", icon: "point_of_sale" },
  { href: "/laboral/inventario", label: "Inventario", icon: "inventory_2" },
  { href: "/laboral/cuentas-por-cobrar", label: "Cuentas por cobrar", icon: "request_quote" },
  { href: "/laboral/gastos", label: "Gastos", icon: "receipt_long" },
  { href: "/laboral/caja", label: "Caja", icon: "account_balance_wallet" },
  { href: "/laboral/reportes", label: "Reportes", icon: "analytics" },
];

function SidebarLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  const pathname = usePathname();
  const activo = pathname === href;
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-label-lg font-semibold transition-colors ${
        activo
          ? "bg-secondary-container text-on-secondary-container"
          : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
      }`}
    >
      <Icon name={icon} fill={activo} />
      {label}
    </Link>
  );
}

// Sidebar único de la app, exclusivo de negocios — design system "Fiscal
// Precision" (Stitch): logo + switcher de negocio arriba, navegación con
// íconos Material Symbols en el medio, Configuración al pie.
export function AppSidebar() {
  return (
    <aside className="fixed left-0 top-0 z-50 hidden h-full w-sidebar-width flex-col border-r border-outline-variant bg-surface-container-low px-4 py-6 md:flex">
      <div className="mb-6 flex items-center gap-3 px-2">
        <div className="flex h-10 w-10 items-center justify-center rounded bg-primary text-on-primary">
          <Icon name="account_balance" fill />
        </div>
        <div>
          <h1 className="text-headline-sm font-bold leading-tight text-on-surface">Money System</h1>
          <span className="text-label-md text-on-surface-variant">Panel de negocio</span>
        </div>
      </div>

      <div className="mb-6 px-0">
        <MisNegociosMenu />
      </div>

      <nav className="flex-1 space-y-1">
        {NAV_ITEMS.map((item) => (
          <SidebarLink key={item.href} {...item} />
        ))}
      </nav>

      <div className="mt-auto space-y-1 border-t border-outline-variant pt-4">
        <SidebarLink href="/laboral/configuracion" label="Configuración" icon="settings" />
      </div>
    </aside>
  );
}
