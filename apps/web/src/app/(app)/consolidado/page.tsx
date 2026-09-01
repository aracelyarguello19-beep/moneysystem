import { DashboardConsolidadoView } from "@/components/dashboard-consolidado";

// A diferencia del resto de `(app)/`, esta página no depende del negocio
// activo — por definición consolida TODOS los negocios de la cuenta.
export default function ConsolidadoPage() {
  return (
    <main className="flex flex-col gap-6 p-8">
      <h1 className="text-xl font-semibold">Dashboard consolidado</h1>
      <DashboardConsolidadoView />
    </main>
  );
}
