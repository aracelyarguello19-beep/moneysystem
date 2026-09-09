import { redirect } from "next/navigation";
import { listarNegocios } from "@/actions/negocios/listar-negocios";
import { OnboardingForm } from "./onboarding-form";

export const dynamic = "force-dynamic";

// Pantalla dedicada para crear el primer negocio de la cuenta — sin sidebar,
// sin switcher de negocios (todavía no hay ninguno). Si la cuenta ya tiene
// al menos un negocio, no tiene sentido volver a mostrarla.
export default async function OnboardingPage() {
  const result = await listarNegocios();
  if (result.ok && result.data.length > 0) {
    redirect("/laboral/ventas");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-6 sm:p-8">
      <div className="w-full max-w-sm rounded-lg border border-default bg-surface-elevated p-6">
        <h1 className="mb-1 text-xl font-semibold">Bienvenido a Money System</h1>
        <p className="mb-6 text-sm text-muted">Empecemos por tu primer negocio.</p>
        <OnboardingForm />
      </div>
    </main>
  );
}
