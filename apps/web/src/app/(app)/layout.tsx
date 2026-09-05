import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { listarNegocios } from "@/actions/negocios/listar-negocios";

// [Source: architecture/frontend-architecture.md#Component Organization]
// TopNavBar fija + sidebar fija (design system "Fiscal Precision") en
// escritorio; por debajo de `md`, el sidebar se reemplaza por un drawer
// abierto desde un botón ☰ en el header — ver AppShell, que es quien
// necesita ser Client Component para compartir ese estado (acá arriba solo
// se resuelve el redirect a onboarding, que sí necesita ser Server Component).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const result = await listarNegocios();
  if (result.ok && result.data.length === 0) {
    redirect("/onboarding");
  }

  return <AppShell>{children}</AppShell>;
}
