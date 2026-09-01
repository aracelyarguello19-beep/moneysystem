import { BalancePersonalView } from "@/components/balance-personal";

// AC5: no depende del negocio activo — agrega todos los negocios de la
// cuenta por definición.
export default function BalancePersonalPage() {
  return (
    <main className="flex flex-col gap-6 p-8">
      <h1 className="text-xl font-semibold">Balance personal</h1>
      <BalancePersonalView />
    </main>
  );
}
