import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { UserMenu } from "@/components/user-menu";
import { listarNegocios } from "@/actions/negocios/listar-negocios";

// [Source: architecture/frontend-architecture.md#Component Organization]
// TopNavBar fija + sidebar fija (design system "Fiscal Precision"): el
// contenido corre con un margen/padding que compensa exactamente el ancho
// del sidebar y el alto del header.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const result = await listarNegocios();
  if (result.ok && result.data.length === 0) {
    redirect("/onboarding");
  }

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <header className="fixed left-0 top-0 z-40 flex h-16 w-full items-center justify-end border-b border-outline-variant bg-surface/80 px-margin-mobile backdrop-blur-md md:left-sidebar-width md:w-[calc(100%-260px)] md:px-margin-desktop">
        <UserMenu />
      </header>
      <main className="min-h-screen pt-16 md:ml-sidebar-width">{children}</main>
    </div>
  );
}
