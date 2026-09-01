import { CuentaFinancieraPersonal } from "@/components/cuenta-financiera-personal";
import { GastoPersonalForm } from "@/components/gasto-personal-form";

// Personal no depende del negocio activo (negocioId siempre null) — mismo
// criterio que `/personal/configuracion`.
export default function GastosPersonalPage() {
  return (
    <main className="flex flex-col gap-10 p-8">
      <h1 className="text-xl font-semibold">Gastos personales</h1>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Cuentas de caja/banco personales</h2>
        <CuentaFinancieraPersonal />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Registrar gasto</h2>
        <GastoPersonalForm />
      </section>
    </main>
  );
}
