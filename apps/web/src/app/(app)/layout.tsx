import { signOut } from "@/actions/auth/sign-out";
import { NegocioSelector } from "@/components/negocio-selector";

// [Source: architecture/frontend-architecture.md#Component Organization]
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b p-4">
        <NegocioSelector />
        <form action={signOut}>
          <button type="submit" className="text-sm underline">
            Cerrar sesión
          </button>
        </form>
      </header>
      {children}
    </div>
  );
}
