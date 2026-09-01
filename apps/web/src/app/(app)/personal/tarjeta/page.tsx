import { TarjetaPanel } from "@/components/tarjeta-panel";

// AC1/AC3: misma lógica y el mismo panel que la tarjeta de un negocio
// (Story 4.2) — Personal no depende del negocio activo (negocioId null).
export default function TarjetaPersonalPage() {
  return (
    <main className="flex flex-col gap-6 p-8">
      <h1 className="text-xl font-semibold">Tarjeta de crédito personal</h1>
      <TarjetaPanel negocioId={null} />
    </main>
  );
}
