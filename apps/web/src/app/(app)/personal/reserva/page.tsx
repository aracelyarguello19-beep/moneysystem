import { ReservaFinancieraConfig } from "@/components/reserva-financiera-config";

// Personal no depende del negocio activo — mismo criterio que el resto de
// `/personal/*`.
export default function ReservaPersonalPage() {
  return (
    <main className="flex flex-col gap-6 p-8">
      <h1 className="text-xl font-semibold">Reserva financiera</h1>
      <ReservaFinancieraConfig />
    </main>
  );
}
