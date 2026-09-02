"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

const ATAJOS = [
  {
    href: "/laboral/caja",
    icon: "account_balance_wallet",
    titulo: "Monedas",
    descripcion: "Agregar o desactivar monedas del negocio, sección \"Monedas\" de Caja.",
  },
  {
    href: "/laboral/gastos",
    icon: "receipt_long",
    titulo: "Tipos de gasto",
    descripcion: "Crear tipos de gasto y su clasificación, sección \"Tipos de gasto\" de Gastos.",
  },
];

// Monedas y Tipos de gasto se mudaron a Caja/Gastos respectivamente (parte
// del rediseño Ventas/Inventario/Caja) — acá queda solo un acceso directo
// para que no se pierdan, ya que Configuración es donde se los busca
// intuitivamente primero.
export default function ConfiguracionLaboralPage() {
  return (
    <main className="flex flex-col gap-8 p-margin-mobile md:p-margin-desktop">
      <PageHeader title="Configuración" description="Accesos a la gestión de catálogos del negocio." />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {ATAJOS.map((atajo) => (
          <Link key={atajo.href} href={atajo.href}>
            <Card className="flex items-start gap-4 transition-colors hover:bg-surface-container-low">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-surface-container-high text-on-surface-variant">
                <Icon name={atajo.icon} />
              </div>
              <div>
                <p className="text-label-lg font-semibold text-on-surface">{atajo.titulo}</p>
                <p className="mt-1 text-body-md text-on-surface-variant">{atajo.descripcion}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
