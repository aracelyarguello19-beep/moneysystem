import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

// Portada de dos columnas (referencia visual: Ticto DESIGN.md) — panel
// oscuro con la marca a la izquierda, tarjeta clara con las acciones de
// acceso a la derecha.
export default function StatusPage() {
  return (
    <main className="flex min-h-screen flex-col md:flex-row">
      <section className="flex flex-1 flex-col justify-center gap-8 bg-[#0b0a10] px-6 py-16 text-white sm:px-12 md:py-0">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#501bf0,#ed9c39,#e53ac9)]">
            <Icon name="account_balance" fill />
          </div>
          <span className="font-display text-headline-sm font-light">Money System</span>
        </div>

        <div className="h-[3px] w-16 rounded-full bg-[linear-gradient(90deg,#501bf0,#ed9c39,#e53ac9)]" />

        <div>
          <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
            Tu negocio, ordenado y al día.
          </h1>
          <p className="mt-3 max-w-sm text-white/60">
            Ventas, compras, gastos e inventario de todos tus negocios en un solo lugar.
          </p>
        </div>
      </section>

      <section className="flex flex-1 items-center justify-center bg-surface px-6 py-16 sm:px-12">
        <div className="w-full max-w-sm">
          <p className="text-label-md font-semibold uppercase tracking-wide text-primary">
            Bienvenido
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-on-surface">
            Iniciá sesión o creá tu cuenta
          </h2>
          <p className="mt-2 text-body-md text-on-surface-variant">
            Sin costos ocultos: administrá tus negocios desde el primer minuto.
          </p>

          <div className="mt-8 flex flex-col gap-3">
            <Button asChild size="lg" className="bg-[linear-gradient(135deg,#501bf0,#ed9c39,#e53ac9)] text-white">
              <a href="/login">Iniciar sesión</a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="/registro">Crear cuenta</a>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
