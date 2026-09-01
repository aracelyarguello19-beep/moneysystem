import { RetirosConsolidado } from "@/components/retiros-consolidado";

// A diferencia de `/laboral/retiros`, esta página no depende del negocio
// activo — agrega los retiros de todos los negocios de la cuenta (AC4).
export default function RetirosPersonalPage() {
  return (
    <main className="flex flex-col gap-6 p-8">
      <h1 className="text-xl font-semibold">Retiros de utilidades</h1>
      <RetirosConsolidado />
    </main>
  );
}
