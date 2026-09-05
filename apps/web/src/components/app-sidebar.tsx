"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MisNegociosMenu } from "@/components/mis-negocios-menu";
import { Icon } from "@/components/ui/icon";

// La sesión "Productos" se inserta entre Ventas y Cuentas por cobrar —
// mismo lugar que ocupaba el ítem suelto "Inventario" antes.
const NAV_ITEMS_ANTES_PRODUCTOS = [
  { href: "/laboral/indicadores", label: "Dashboard", icon: "dashboard" },
  { href: "/laboral/ventas", label: "Ventas", icon: "point_of_sale" },
];
const NAV_ITEMS_DESPUES_PRODUCTOS = [
  { href: "/laboral/cuentas-por-cobrar", label: "Cuentas por cobrar", icon: "request_quote" },
  { href: "/laboral/gastos", label: "Gastos", icon: "receipt" },
  { href: "/laboral/caja", label: "Caja", icon: "account_balance_wallet" },
  { href: "/laboral/reportes", label: "Reportes", icon: "analytics" },
];

// "Productos" agrupa Compras (el historial, tal cual se registró cada
// compra) e Inventario (el stock/valor combinado por producto) — separadas
// porque cuentan cosas distintas: una compra puntual vs. el total acumulado.
const PRODUCTOS_ITEMS = [
  { href: "/laboral/compras", label: "Compras", icon: "shopping_cart" },
  { href: "/laboral/inventario", label: "Inventario", icon: "grid_view" },
];

// Tile con el gradiente de marca (morado→naranja→magenta) detrás del
// ícono del ítem activo — mismo tratamiento que el logo, reservado al link
// que corresponde a la sección actual (Ticto DESIGN.md, componente #1).
function IconoActivo({ icon }: { icon: string }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[linear-gradient(135deg,#501bf0,#ed9c39,#e53ac9)] text-white">
      <Icon name={icon} fill className="text-[18px]" />
    </span>
  );
}

function SidebarLink({
  href,
  label,
  icon,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const activo = pathname === href;
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-label-lg font-semibold transition-colors ${
        activo
          ? "bg-secondary-container text-on-secondary-container"
          : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
      }`}
    >
      {activo ? <IconoActivo icon={icon} /> : <Icon name={icon} className="shrink-0" />}
      <span className="whitespace-nowrap">{label}</span>
    </Link>
  );
}

// Grupo desplegable — se abre solo si Compras o Inventario está activo,
// para no obligar un clic extra al llegar directo a cualquiera de las dos.
function ProductosGroup({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const algunoActivo = PRODUCTOS_ITEMS.some((item) => pathname === item.href);
  const [abierto, setAbierto] = useState(algunoActivo);

  return (
    <div>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-label-lg font-semibold transition-colors ${
          algunoActivo
            ? "text-on-surface"
            : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
        }`}
      >
        <span className="flex items-center gap-3">
          <Icon name="inventory_2" fill={algunoActivo} className="shrink-0" />
          <span className="whitespace-nowrap">Productos</span>
        </span>
        <Icon name={abierto ? "expand_less" : "expand_more"} className="text-[18px]" />
      </button>
      {abierto && (
        <div className="ml-4 mt-1 space-y-1 border-l border-outline-variant pl-3">
          {PRODUCTOS_ITEMS.map((item) => (
            <SidebarLink key={item.href} {...item} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

// Contenido compartido entre el sidebar fijo de escritorio y el drawer
// móvil — mismo logo/switcher/nav/pie en los dos, para no duplicar la
// estructura de navegación en dos lugares que puedan desincronizarse.
// `onNavigate` cierra el drawer al elegir un link (no aplica en escritorio,
// donde el sidebar siempre está visible).
function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="mb-4 flex items-center gap-3 px-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#501bf0,#ed9c39,#e53ac9)] text-white">
          <Icon name="account_balance" fill />
        </div>
        <div className="min-w-0 whitespace-nowrap">
          <h1 className="font-display text-headline-sm font-light leading-tight text-on-surface">Money System</h1>
          <span className="text-label-md text-on-surface-variant">Panel de negocio</span>
        </div>
      </div>
      {/* Franja de marca bajo el logo — mismo gradiente morado→naranja→magenta que Ticto usa como acento de identidad. */}
      <div className="mb-6 h-[3px] w-full rounded-full bg-[linear-gradient(90deg,#501bf0,#ed9c39,#e53ac9)]" />

      <div className="mb-6 px-0">
        <MisNegociosMenu />
      </div>

      <nav className="flex-1 space-y-1">
        {NAV_ITEMS_ANTES_PRODUCTOS.map((item) => (
          <SidebarLink key={item.href} {...item} onNavigate={onNavigate} />
        ))}
        <ProductosGroup onNavigate={onNavigate} />
        {NAV_ITEMS_DESPUES_PRODUCTOS.map((item) => (
          <SidebarLink key={item.href} {...item} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="mt-auto space-y-1 border-t border-outline-variant pt-4">
        <SidebarLink href="/laboral/configuracion" label="Configuración" icon="settings" onNavigate={onNavigate} />
      </div>
    </>
  );
}

// Sidebar fijo de escritorio — ancho fijo (230px), siempre expandido con
// labels visibles (pedido explícito: nada de colapsar a riel de solo
// íconos ni expandir por hover). `fixed` + `z-50`: el contenido de la
// página nunca se corre por scroll, `app-shell.tsx` reserva ese mismo
// ancho con `ml-sidebar-width-expanded`. Invisible por debajo de `md` (ver
// MobileNavDrawer, que cubre esos anchos con el mismo contenido).
export function AppSidebar() {
  return (
    <aside className="fixed left-0 top-0 z-50 hidden h-full w-sidebar-width-expanded flex-col border-r border-outline-variant bg-surface-container-low px-4 py-6 md:flex">
      <SidebarContent />
    </aside>
  );
}

// Drawer de navegación para mobile/tablet (por debajo de `md`) — antes de
// esto, el sidebar (única forma de navegar entre secciones) simplemente
// desaparecía en pantallas chicas sin ningún reemplazo: la app quedaba sin
// forma de cambiar de sección. Siempre montado (para poder animar la
// entrada/salida con `transition-transform`), pero fuera de pantalla y sin
// bloquear clics cuando está cerrado.
export function MobileNavDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div className={`fixed inset-0 z-[60] md:hidden ${open ? "" : "pointer-events-none"}`}>
      <div
        className={`absolute inset-0 bg-inverse-surface/40 transition-opacity ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`absolute left-0 top-0 flex h-full w-[85vw] max-w-[280px] flex-col bg-surface-container-low px-4 py-6 shadow-lg transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Menú de navegación"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar menú"
          className="absolute right-3 top-3 rounded p-1.5 text-on-surface-variant hover:bg-surface-container-high"
        >
          <Icon name="close" />
        </button>
        <SidebarContent onNavigate={onClose} />
      </aside>
    </div>
  );
}
