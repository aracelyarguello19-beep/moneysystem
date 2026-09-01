import { MonedaCatalogo } from "@/components/moneda-catalogo";
import { TipoGastoCatalogo } from "@/components/tipo-gasto-catalogo";

// Catálogo Personal: siempre negocioId null, independiente del negocio
// activo. [Source: architecture/data-models.md#Moneda, #TipoGasto]
export default function ConfiguracionPersonalPage() {
  return (
    <main className="flex flex-col gap-10 p-8">
      <h1 className="text-xl font-semibold">Configuración Personal</h1>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Monedas</h2>
        <MonedaCatalogo ambito="PERSONAL" negocioId={null} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Tipos de gasto</h2>
        <TipoGastoCatalogo ambito="PERSONAL" negocioId={null} />
      </section>
    </main>
  );
}
